// OmniCore Escrow Engine
// High-performance, thread-safe escrow core. Holds balances, locks funds,
// releases or refunds them atomically. No AI here — only correctness & speed.
//
// Money is stored as integer cents (int64). Never floats. Ever.

#include "../httplib.h"
#include "../json.hpp"

#include <atomic>
#include <chrono>
#include <cstdint>
#include <mutex>
#include <shared_mutex>
#include <string>
#include <unordered_map>
#include <vector>

using json = nlohmann::json;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

enum class EscrowState { Locked, Released, Refunded };

static const char* to_string(EscrowState s) {
    switch (s) {
        case EscrowState::Locked:   return "LOCKED";
        case EscrowState::Released: return "RELEASED";
        case EscrowState::Refunded: return "REFUNDED";
    }
    return "UNKNOWN";
}

struct Account {
    std::string id;
    std::string name;
    int64_t available_cents = 0;  // spendable
    int64_t locked_cents    = 0;  // held in escrow (buyer side)
};

struct Escrow {
    std::string id;
    std::string buyer_id;
    std::string seller_id;
    int64_t amount_cents = 0;
    EscrowState state = EscrowState::Locked;
    std::string created_at;
    std::string settled_at;  // empty until released/refunded
};

struct AuditEntry {
    std::string ts;
    std::string action;   // LOCK / RELEASE / REFUND / DEPOSIT / CREATE_ACCOUNT
    std::string escrow_id;
    std::string detail;
};

// ---------------------------------------------------------------------------
// Ledger — the single source of truth. One writer at a time, many readers.
// ---------------------------------------------------------------------------

class Ledger {
public:
    // --- account ops ---
    json create_account(const std::string& name, int64_t initial_cents) {
        std::unique_lock lock(mu_);
        std::string id = "ACC-" + std::to_string(++account_seq_);
        accounts_[id] = Account{id, name, initial_cents, 0};
        audit_("CREATE_ACCOUNT", "", id + " '" + name + "' opened with " +
               std::to_string(initial_cents) + "c");
        return account_json_(accounts_[id]);
    }

    json deposit(const std::string& account_id, int64_t cents, std::string& err) {
        std::unique_lock lock(mu_);
        auto* acc = find_(account_id);
        if (!acc) { err = "account not found"; return {}; }
        if (cents <= 0) { err = "amount must be positive"; return {}; }
        acc->available_cents += cents;
        audit_("DEPOSIT", "", account_id + " +" + std::to_string(cents) + "c");
        return account_json_(*acc);
    }

    json get_account(const std::string& account_id, std::string& err) {
        std::shared_lock lock(mu_);
        auto* acc = find_(account_id);
        if (!acc) { err = "account not found"; return {}; }
        return account_json_(*acc);
    }

    // --- escrow ops (all atomic under the ledger lock) ---

    // LockFunds: move buyer available -> buyer locked, open escrow.
    json lock_funds(const std::string& buyer_id, const std::string& seller_id,
                    int64_t cents, std::string& err) {
        std::unique_lock lock(mu_);
        auto* buyer  = find_(buyer_id);
        auto* seller = find_(seller_id);
        if (!buyer)  { err = "buyer account not found"; return {}; }
        if (!seller) { err = "seller account not found"; return {}; }
        if (cents <= 0) { err = "amount must be positive"; return {}; }
        if (buyer->available_cents < cents) { err = "insufficient funds"; return {}; }

        buyer->available_cents -= cents;
        buyer->locked_cents    += cents;

        std::string id = "ESC-" + std::to_string(++escrow_seq_);
        Escrow e{id, buyer_id, seller_id, cents, EscrowState::Locked, now_(), ""};
        escrows_[id] = e;
        audit_("LOCK", id, std::to_string(cents) + "c locked from " + buyer_id);
        return escrow_json_(e);
    }

    // ReleaseFunds: buyer locked -> seller available. Terminal.
    json release_funds(const std::string& escrow_id, std::string& err) {
        return settle_(escrow_id, /*to_seller=*/true, err);
    }

    // RefundBuyer: buyer locked -> buyer available. Terminal.
    json refund_buyer(const std::string& escrow_id, std::string& err) {
        return settle_(escrow_id, /*to_seller=*/false, err);
    }

    json get_escrow(const std::string& escrow_id, std::string& err) {
        std::shared_lock lock(mu_);
        auto it = escrows_.find(escrow_id);
        if (it == escrows_.end()) { err = "escrow not found"; return {}; }
        return escrow_json_(it->second);
    }

    json audit_log() {
        std::shared_lock lock(mu_);
        json out = json::array();
        for (const auto& a : log_)
            out.push_back({{"ts", a.ts}, {"action", a.action},
                           {"escrow_id", a.escrow_id}, {"detail", a.detail}});
        return out;
    }

    json stats() {
        std::shared_lock lock(mu_);
        int64_t total_locked = 0;
        int active = 0, released = 0, refunded = 0;
        for (const auto& [id, e] : escrows_) {
            if (e.state == EscrowState::Locked) { total_locked += e.amount_cents; ++active; }
            else if (e.state == EscrowState::Released) ++released;
            else ++refunded;
        }
        return {{"accounts", accounts_.size()}, {"escrows_active", active},
                {"escrows_released", released}, {"escrows_refunded", refunded},
                {"total_locked_cents", total_locked}};
    }

private:
    Account* find_(const std::string& id) {
        auto it = accounts_.find(id);
        return it == accounts_.end() ? nullptr : &it->second;
    }

    json settle_(const std::string& escrow_id, bool to_seller, std::string& err) {
        std::unique_lock lock(mu_);
        auto it = escrows_.find(escrow_id);
        if (it == escrows_.end()) { err = "escrow not found"; return {}; }
        Escrow& e = it->second;
        if (e.state != EscrowState::Locked) {
            err = std::string("escrow already settled (") + to_string(e.state) + ")";
            return {};
        }
        auto* buyer  = find_(e.buyer_id);
        auto* seller = find_(e.seller_id);
        if (!buyer || !seller) { err = "ledger corruption: party missing"; return {}; }

        // Atomic move — both sides mutate under the same lock or not at all.
        buyer->locked_cents -= e.amount_cents;
        if (to_seller) {
            seller->available_cents += e.amount_cents;
            e.state = EscrowState::Released;
            audit_("RELEASE", e.id, std::to_string(e.amount_cents) + "c -> " + e.seller_id);
        } else {
            buyer->available_cents += e.amount_cents;
            e.state = EscrowState::Refunded;
            audit_("REFUND", e.id, std::to_string(e.amount_cents) + "c -> " + e.buyer_id);
        }
        e.settled_at = now_();
        return escrow_json_(e);
    }

    void audit_(const std::string& action, const std::string& escrow_id,
                const std::string& detail) {
        log_.push_back({now_(), action, escrow_id, detail});
    }

    static std::string now_() {
        auto t  = std::chrono::system_clock::now();
        auto tt = std::chrono::system_clock::to_time_t(t);
        char buf[32];
        std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", std::gmtime(&tt));
        return buf;
    }

    static json account_json_(const Account& a) {
        return {{"id", a.id}, {"name", a.name},
                {"available_cents", a.available_cents},
                {"locked_cents", a.locked_cents}};
    }

    static json escrow_json_(const Escrow& e) {
        return {{"id", e.id}, {"buyer_id", e.buyer_id}, {"seller_id", e.seller_id},
                {"amount_cents", e.amount_cents}, {"state", to_string(e.state)},
                {"created_at", e.created_at}, {"settled_at", e.settled_at}};
    }

    mutable std::shared_mutex mu_;
    std::unordered_map<std::string, Account> accounts_;
    std::unordered_map<std::string, Escrow>  escrows_;
    std::vector<AuditEntry> log_;
    std::atomic<uint64_t> account_seq_{0};
    std::atomic<uint64_t> escrow_seq_{0};
};

// ---------------------------------------------------------------------------
// HTTP API — thin wrapper. The FastAPI backend is the only intended client.
// ---------------------------------------------------------------------------

static void reply(httplib::Response& res, const json& body, int status = 200) {
    res.status = status;
    res.set_content(body.dump(2), "application/json");
}

static void fail(httplib::Response& res, const std::string& err, int status = 400) {
    reply(res, json{{"error", err}}, status);
}

int main(int argc, char** argv) {
    int port = (argc > 1) ? std::atoi(argv[1]) : 7070;
    Ledger ledger;
    httplib::Server srv;

    srv.Get("/health", [](const httplib::Request&, httplib::Response& res) {
        reply(res, {{"status", "ok"}, {"engine", "omnicore-core/0.1"}});
    });

    srv.Post("/accounts", [&](const httplib::Request& req, httplib::Response& res) {
        auto b = json::parse(req.body, nullptr, false);
        if (b.is_discarded() || !b.contains("name"))
            return fail(res, "expected {name, initial_cents?}");
        reply(res, ledger.create_account(b["name"], b.value("initial_cents", 0)), 201);
    });

    srv.Post("/accounts/:id/deposit", [&](const httplib::Request& req, httplib::Response& res) {
        auto b = json::parse(req.body, nullptr, false);
        if (b.is_discarded() || !b.contains("amount_cents"))
            return fail(res, "expected {amount_cents}");
        std::string err;
        auto out = ledger.deposit(req.path_params.at("id"), b["amount_cents"], err);
        err.empty() ? reply(res, out) : fail(res, err);
    });

    srv.Get("/accounts/:id", [&](const httplib::Request& req, httplib::Response& res) {
        std::string err;
        auto out = ledger.get_account(req.path_params.at("id"), err);
        err.empty() ? reply(res, out) : fail(res, err, 404);
    });

    srv.Post("/escrows/lock", [&](const httplib::Request& req, httplib::Response& res) {
        auto b = json::parse(req.body, nullptr, false);
        if (b.is_discarded() || !b.contains("buyer_id") || !b.contains("seller_id")
            || !b.contains("amount_cents"))
            return fail(res, "expected {buyer_id, seller_id, amount_cents}");
        std::string err;
        auto out = ledger.lock_funds(b["buyer_id"], b["seller_id"], b["amount_cents"], err);
        err.empty() ? reply(res, out, 201) : fail(res, err);
    });

    srv.Post("/escrows/:id/release", [&](const httplib::Request& req, httplib::Response& res) {
        std::string err;
        auto out = ledger.release_funds(req.path_params.at("id"), err);
        err.empty() ? reply(res, out) : fail(res, err);
    });

    srv.Post("/escrows/:id/refund", [&](const httplib::Request& req, httplib::Response& res) {
        std::string err;
        auto out = ledger.refund_buyer(req.path_params.at("id"), err);
        err.empty() ? reply(res, out) : fail(res, err);
    });

    srv.Get("/escrows/:id", [&](const httplib::Request& req, httplib::Response& res) {
        std::string err;
        auto out = ledger.get_escrow(req.path_params.at("id"), err);
        err.empty() ? reply(res, out) : fail(res, err, 404);
    });

    srv.Get("/audit", [&](const httplib::Request&, httplib::Response& res) {
        reply(res, ledger.audit_log());
    });

    srv.Get("/stats", [&](const httplib::Request&, httplib::Response& res) {
        reply(res, ledger.stats());
    });

    printf("OmniCore engine listening on :%d\n", port);
    srv.listen("0.0.0.0", port);
    return 0;
}
