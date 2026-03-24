"""
QuantumPay backend — payment chain secured by QHF.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from quantum_hash import qhf, avalanche_test, sha256_compare

from payment_chain import (
    append_payment,
    get_chain,
    reset_chain,
    tamper_payment,
    verify_chain,
)

app = FastAPI(title="QuantumPay", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/payments/chain")
def payments_chain():
    return get_chain()


@app.get("/payments/verify")
def payments_verify():
    return verify_chain()


class TamperPaymentBody(BaseModel):
    block_index: int
    field: str
    new_value: str


@app.post("/payments/tamper")
def payments_tamper(body: TamperPaymentBody):
    return tamper_payment(body.block_index, body.field, body.new_value)


@app.post("/payments/reset")
def payments_reset():
    return reset_chain()


class NewPaymentBody(BaseModel):
    sender: str
    receiver: str
    amount: str
    note: str


@app.post("/payments/new")
def payments_new(body: NewPaymentBody):
    return append_payment(body.sender, body.receiver, body.amount, body.note)

@app.get("/qhf/hash")
def qhf_hash(message: str):
    return qhf(message)


@app.get("/qhf/avalanche")
def qhf_avalanche(message: str):
    return avalanche_test(message)


@app.get("/qhf/compare")
def qhf_compare(message: str):
    return sha256_compare(message)
