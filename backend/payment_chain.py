"""
In-memory quantum-hash payment chain.
Uses qhf from quantum_hash — does not reimplement hashing.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any, Dict, List, Optional

from quantum_hash import qhf

PAYMENT_CHAIN: List[Dict[str, Any]] = []

GENESIS_PREV = "0" * 128  # matches full QHF hex length (512 bits)


def _payment_id(sender: str, receiver: str, amount: str, timestamp: str) -> str:
    return qhf(sender + receiver + amount + timestamp)["hash_hex"][:16]


def _block_hash(
    index: int,
    payment_id: str,
    sender: str,
    receiver: str,
    amount: str,
    timestamp: str,
    previous_hash: str,
) -> str:
    content_string = (
        str(index)
        + payment_id
        + sender
        + receiver
        + amount
        + timestamp
        + previous_hash
    )
    return qhf(content_string)["hash_hex"]


def _build_chain() -> List[Dict[str, Any]]:
    chain: List[Dict[str, Any]] = []

    # Genesis block (index 0)
    g_sender = "QuantumPay"
    g_receiver = "Network Genesis"
    g_amount = "₹0"
    g_ts = "00:00:00"
    g_note = "Genesis — Quantum Payment Chain Initialized"
    g_pid = _payment_id(g_sender, g_receiver, g_amount, g_ts)
    g_payment = {
        "sender": g_sender,
        "receiver": g_receiver,
        "amount": g_amount,
        "timestamp": g_ts,
        "note": g_note,
        "payment_id": g_pid,
    }
    g_hash = _block_hash(0, g_pid, g_sender, g_receiver, g_amount, g_ts, GENESIS_PREV)
    chain.append(
        {
            "index": 0,
            "timestamp": g_ts,
            "payment": g_payment,
            "previous_hash": GENESIS_PREV,
            "block_hash": g_hash,
            "tampered": False,
        }
    )

    seed_blocks = [
        {
            "sender": "Arjun Sharma",
            "receiver": "HDFC Merchant — PhonePe A/C 9876",
            "amount": "₹50,000",
            "timestamp": "21:43:50",
            "note": "UPI Transfer — Festival Shopping",
        },
        {
            "sender": "Priya Menon",
            "receiver": "Amazon India — Seller A/C 4421",
            "amount": "₹12,499",
            "timestamp": "21:44:03",
            "note": "Online Purchase — Laptop Accessories",
        },
        {
            "sender": "Rohit Verma",
            "receiver": "Zomato — Restaurant Settlement",
            "amount": "₹840",
            "timestamp": "21:44:25",
            "note": "Food Delivery Payment",
        },
        {
            "sender": "Sneha Iyer",
            "receiver": "LIC Premium — Policy 98712",
            "amount": "₹25,000",
            "timestamp": "21:45:08",
            "note": "Insurance Premium — Quarterly",
        },
    ]

    for idx, pdata in enumerate(seed_blocks, start=1):
        prev_hash = chain[-1]["block_hash"]
        pid = _payment_id(
            pdata["sender"],
            pdata["receiver"],
            pdata["amount"],
            pdata["timestamp"],
        )
        payment = {
            "sender": pdata["sender"],
            "receiver": pdata["receiver"],
            "amount": pdata["amount"],
            "timestamp": pdata["timestamp"],
            "note": pdata["note"],
            "payment_id": pid,
        }
        b_hash = _block_hash(
            idx,
            pid,
            payment["sender"],
            payment["receiver"],
            payment["amount"],
            payment["timestamp"],
            prev_hash,
        )
        chain.append(
            {
                "index": idx,
                "timestamp": pdata["timestamp"],
                "payment": payment,
                "previous_hash": prev_hash,
                "block_hash": b_hash,
                "tampered": False,
            }
        )

    return chain


def get_chain() -> List[Dict[str, Any]]:
    return [deepcopy(b) for b in PAYMENT_CHAIN]


def verify_chain() -> Dict[str, Any]:
    results: List[Dict[str, Any]] = []
    overall = True

    # Block 0 — genesis
    b0 = PAYMENT_CHAIN[0]
    p0 = b0["payment"]
    r_pid0 = _payment_id(
        p0["sender"], p0["receiver"], p0["amount"], p0["timestamp"]
    )
    pid_ok0 = r_pid0 == p0["payment_id"]
    r_hash0 = _block_hash(
        0,
        p0["payment_id"],
        p0["sender"],
        p0["receiver"],
        p0["amount"],
        p0["timestamp"],
        b0["previous_hash"],
    )
    hash_ok0 = r_hash0 == b0["block_hash"]
    link_ok0 = b0["previous_hash"] == GENESIS_PREV
    ok0 = pid_ok0 and hash_ok0 and link_ok0
    overall = overall and ok0
    results.append(
        {
            "index": 0,
            "payment_id_valid": pid_ok0,
            "block_hash_valid": hash_ok0,
            "chain_link_valid": link_ok0,
            "overall_valid": ok0,
            "failure_reason": None
            if ok0
            else _failure_reason_genesis(pid_ok0, hash_ok0, link_ok0, r_pid0, p0),
        }
    )

    for i in range(1, len(PAYMENT_CHAIN)):
        block = PAYMENT_CHAIN[i]
        payment = block["payment"]
        prev_block = PAYMENT_CHAIN[i - 1]

        r_pid = _payment_id(
            payment["sender"],
            payment["receiver"],
            payment["amount"],
            payment["timestamp"],
        )
        payment_id_valid = r_pid == payment["payment_id"]

        r_block_hash = _block_hash(
            block["index"],
            payment["payment_id"],
            payment["sender"],
            payment["receiver"],
            payment["amount"],
            payment["timestamp"],
            block["previous_hash"],
        )
        block_hash_valid = r_block_hash == block["block_hash"]

        chain_link_valid = block["previous_hash"] == prev_block["block_hash"]

        ok = payment_id_valid and block_hash_valid and chain_link_valid
        overall = overall and ok

        failure_reason: Optional[str] = None
        if not ok:
            failure_reason = _failure_reason_payment(
                payment_id_valid,
                block_hash_valid,
                chain_link_valid,
                payment,
                r_pid,
                block,
                prev_block,
            )

        results.append(
            {
                "index": block["index"],
                "payment_id_valid": payment_id_valid,
                "block_hash_valid": block_hash_valid,
                "chain_link_valid": chain_link_valid,
                "overall_valid": ok,
                "failure_reason": failure_reason,
                "recomputed_payment_id": r_pid if not payment_id_valid else None,
                "stored_payment_id": payment["payment_id"],
            }
        )

    return {
        "valid": overall,
        "blocks_checked": len(PAYMENT_CHAIN),
        "results": results,
    }


def _failure_reason_genesis(
    pid_ok: bool, hash_ok: bool, link_ok: bool, r_pid: str, p0: Dict[str, Any]
) -> str:
    if not pid_ok:
        return f"Payment ID mismatch — stored {p0['payment_id']}, recomputed {r_pid}"
    if not hash_ok:
        return "Block hash invalid — genesis block hash does not match"
    if not link_ok:
        return "Chain link broken — genesis previous hash invalid"
    return "Unknown genesis verification failure"


def _failure_reason_payment(
    payment_id_valid: bool,
    block_hash_valid: bool,
    chain_link_valid: bool,
    payment: Dict[str, Any],
    r_pid: str,
    block: Dict[str, Any],
    prev_block: Dict[str, Any],
) -> str:
    if not payment_id_valid:
        return "Payment ID mismatch — payment data was tampered"
    if not chain_link_valid:
        return "Chain link broken — previous hash does not match prior block"
    if not block_hash_valid:
        return "Block hash invalid — block content does not match stored hash"
    return "Verification failed"


def tamper_payment(block_index: int, field: str, new_value: str) -> List[Dict[str, Any]]:
    allowed = {"sender", "receiver", "amount", "timestamp", "note"}
    if (
        0 <= block_index < len(PAYMENT_CHAIN)
        and field in allowed
        and field in PAYMENT_CHAIN[block_index]["payment"]
    ):
        PAYMENT_CHAIN[block_index]["payment"][field] = new_value
        PAYMENT_CHAIN[block_index]["tampered"] = True
    return get_chain()


def reset_chain() -> List[Dict[str, Any]]:
    global PAYMENT_CHAIN
    PAYMENT_CHAIN = _build_chain()
    return get_chain()


def append_payment(
    sender: str, receiver: str, amount: str, note: str
) -> Dict[str, Any]:
    timestamp = datetime.now().strftime("%H:%M:%S")
    index = len(PAYMENT_CHAIN)
    prev_hash = PAYMENT_CHAIN[-1]["block_hash"]
    pid = _payment_id(sender, receiver, amount, timestamp)
    payment = {
        "sender": sender,
        "receiver": receiver,
        "amount": amount,
        "timestamp": timestamp,
        "note": note,
        "payment_id": pid,
    }
    b_hash = _block_hash(
        index,
        pid,
        sender,
        receiver,
        amount,
        timestamp,
        prev_hash,
    )
    block = {
        "index": index,
        "timestamp": timestamp,
        "payment": payment,
        "previous_hash": prev_hash,
        "block_hash": b_hash,
        "tampered": False,
    }
    PAYMENT_CHAIN.append(block)
    return deepcopy(block)


PAYMENT_CHAIN = _build_chain()
