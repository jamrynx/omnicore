"""Client for the C++ escrow engine. The ONLY code allowed to move money."""
import os

import httpx

ENGINE_URL = os.getenv("ENGINE_URL", "http://localhost:7070")


class EngineError(RuntimeError):
    pass


async def _call(method: str, path: str, body: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=5.0) as client:
        r = await client.request(method, f"{ENGINE_URL}{path}", json=body)
    data = r.json()
    if r.status_code >= 400:
        raise EngineError(data.get("error", f"engine returned {r.status_code}"))
    return data


async def create_account(name: str, initial_cents: int = 0) -> dict:
    return await _call("POST", "/accounts", {"name": name, "initial_cents": initial_cents})


async def get_account(account_id: str) -> dict:
    return await _call("GET", f"/accounts/{account_id}")


async def lock_funds(buyer_id: str, seller_id: str, amount_cents: int) -> dict:
    return await _call("POST", "/escrows/lock",
                       {"buyer_id": buyer_id, "seller_id": seller_id,
                        "amount_cents": amount_cents})


async def release_funds(escrow_id: str) -> dict:
    return await _call("POST", f"/escrows/{escrow_id}/release")


async def refund_buyer(escrow_id: str) -> dict:
    return await _call("POST", f"/escrows/{escrow_id}/refund")


async def stats() -> dict:
    return await _call("GET", "/stats")


async def health() -> bool:
    try:
        await _call("GET", "/health")
        return True
    except Exception:
        return False
