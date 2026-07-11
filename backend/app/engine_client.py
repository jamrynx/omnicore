"""Client for the C++ escrow engine. The ONLY code allowed to move money."""
import os

import httpx

ENGINE_URL = os.getenv("ENGINE_URL", "http://localhost:7070")


class EngineError(RuntimeError):
    pass


async def _call(method: str, path: str, body: dict | None = None) -> dict:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.request(method, f"{ENGINE_URL}{path}", json=body)
    except httpx.HTTPError as e:
        raise EngineError(f"escrow engine unreachable at {ENGINE_URL} — is the "
                          f"engine service running? ({type(e).__name__})")
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


async def settle_partial(escrow_id: str, release_cents: int) -> dict:
    return await _call("POST", f"/escrows/{escrow_id}/settle",
                       {"release_cents": release_cents})


async def deposit(account_id: str, cents: int) -> dict:
    return await _call("POST", f"/accounts/{account_id}/deposit",
                       {"amount_cents": cents})


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
