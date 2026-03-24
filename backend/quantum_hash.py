"""
CAQW-based Quantum Hash Function implementation using numpy.
Based on Abd El-Latif et al. (2021).
"""

from __future__ import annotations

from math import cos, pi, sin
import hashlib
from typing import Dict, List

import numpy as np


def _coin_matrix(theta: float) -> np.ndarray:
    return np.array(
        [[cos(theta), sin(theta)], [sin(theta), -cos(theta)]],
        dtype=np.complex128,
    )


def _message_to_bits(message_string: str) -> str:
    return "".join(format(ord(ch), "08b") for ch in message_string)


def _apply_coin(state: np.ndarray, coin: np.ndarray) -> np.ndarray:
    # Apply 2x2 coin matrix at each (x, y) position.
    return np.einsum("ab,xyb->xya", coin, state)


def _shift_x(state: np.ndarray) -> np.ndarray:
    out = np.zeros_like(state)
    out[:, :, 0] = np.roll(state[:, :, 0], shift=1, axis=0)
    out[:, :, 1] = np.roll(state[:, :, 1], shift=-1, axis=0)
    return out


def _shift_y(state: np.ndarray) -> np.ndarray:
    out = np.zeros_like(state)
    out[:, :, 0] = np.roll(state[:, :, 0], shift=1, axis=1)
    out[:, :, 1] = np.roll(state[:, :, 1], shift=-1, axis=1)
    return out


def _apply_u(state: np.ndarray, coin: np.ndarray) -> np.ndarray:
    state = _apply_coin(state, coin)
    state = _shift_x(state)
    state = _apply_coin(state, coin)
    state = _shift_y(state)
    return state


def _qhf_from_bits(
    bit_string: str,
    N: int,
    alpha: complex,
    beta: complex,
    theta0: float,
    theta1: float,
    theta2: float,
) -> Dict[str, object]:
    c0 = _coin_matrix(theta0)
    c1 = _coin_matrix(theta1)
    c2 = _coin_matrix(theta2)

    state = np.zeros((N, N, 2), dtype=np.complex128)
    # Parity-mixed initialization improves diffusion across the full grid.
    init_positions = [(0, 0), (0, 1 % N), (1 % N, 0), (1 % N, 1 % N)]
    amp_scale = 0.5
    for x, y in init_positions:
        state[x, y, 0] = complex(alpha) * amp_scale
        state[x, y, 1] = complex(beta) * amp_scale

    norm = np.sqrt(np.sum(np.abs(state) ** 2))
    if norm == 0:
        state[0, 0, 0] = 1.0 + 0j
    else:
        state = state / norm

    steps = max(len(bit_string), N * N, 4096)

    for i in range(steps):
        if i < len(bit_string):
            state = _apply_u(state, c0 if bit_string[i] == "0" else c1)
        else:
            state = _apply_u(state, c2)

    probability_matrix = np.sum(np.abs(state) ** 2, axis=2)

    bits: List[str] = []
    for x in range(N):
        for y in range(N):
            int_val = int(probability_matrix[x, y] * (10**8)) % 256
            bits.append(format(int_val, "08b"))
    hash_bits = "".join(bits)
    hash_hex = format(int(hash_bits, 2), f"0{len(hash_bits) // 4}x")

    return {
        "hash_bits": hash_bits,
        "hash_hex": hash_hex,
        "bit_length": len(hash_bits),
        "steps_run": steps,
        "probability_matrix": probability_matrix.real.tolist(),
    }


def qhf(
    message_string: str,
    N: int = 8,
    alpha: complex = 1,
    beta: complex = 0,
    theta0: float = pi / 3,
    theta1: float = pi / 6,
    theta2: float = pi / 4,
) -> Dict[str, object]:
    bit_string = _message_to_bits(message_string)
    return _qhf_from_bits(bit_string, N, alpha, beta, theta0, theta1, theta2)


def avalanche_test(message_string: str) -> Dict[str, object]:
    original_bits = _message_to_bits(message_string)
    if not original_bits:
        original_bits = "00000000"

    mid = len(original_bits) // 2
    flipped = "1" if original_bits[mid] == "0" else "0"
    modified_bits = original_bits[:mid] + flipped + original_bits[mid + 1 :]

    original = _qhf_from_bits(original_bits, 8, 1, 0, pi / 3, pi / 6, pi / 4)
    modified = _qhf_from_bits(modified_bits, 8, 1, 0, pi / 3, pi / 6, pi / 4)

    differing_bits = sum(
        1 for a, b in zip(original["hash_bits"], modified["hash_bits"]) if a != b
    )
    total_bits = len(original["hash_bits"])
    differing_percent = (differing_bits / total_bits) * 100 if total_bits else 0.0

    return {
        "original_message": message_string,
        "original_hash_bits": original["hash_bits"],
        "modified_message_bits": modified_bits,
        "modified_hash_bits": modified["hash_bits"],
        "total_bits": total_bits,
        "differing_bits": differing_bits,
        "differing_percent": round(differing_percent, 2),
        "avalanche_passed": differing_percent >= 40.0,
    }


def _bits_to_bytes(bit_string: str) -> bytes:
    if not bit_string:
        return b""
    padded_len = ((len(bit_string) + 7) // 8) * 8
    padded = bit_string.ljust(padded_len, "0")
    return bytes(int(padded[i : i + 8], 2) for i in range(0, padded_len, 8))


def _sha256_bits(data: bytes) -> str:
    digest = hashlib.sha256(data).digest()
    return "".join(format(b, "08b") for b in digest)


def sha256_compare(message_string: str) -> Dict[str, object]:
    qhf_result = qhf(message_string)
    qhf_avalanche = avalanche_test(message_string)

    original_bits = _message_to_bits(message_string)
    if not original_bits:
        original_bits = "00000000"
    mid = len(original_bits) // 2
    flipped = "1" if original_bits[mid] == "0" else "0"
    modified_bits = original_bits[:mid] + flipped + original_bits[mid + 1 :]

    sha_original_bytes = message_string.encode("utf-8")
    sha_modified_bytes = _bits_to_bytes(modified_bits)
    sha_original_hex = hashlib.sha256(sha_original_bytes).hexdigest()
    sha_original_bits = _sha256_bits(sha_original_bytes)
    sha_modified_bits = _sha256_bits(sha_modified_bytes)

    sha_diff = sum(1 for a, b in zip(sha_original_bits, sha_modified_bits) if a != b)
    sha_total = len(sha_original_bits)
    sha_percent = (sha_diff / sha_total) * 100 if sha_total else 0.0

    return {
        "message": message_string,
        "qhf": {
            "hash_hex": qhf_result["hash_hex"],
            "bit_length": qhf_result["bit_length"],
            "differing_bits_on_flip": qhf_avalanche["differing_bits"],
            "differing_percent": qhf_avalanche["differing_percent"],
        },
        "sha256": {
            "hash_hex": sha_original_hex,
            "bit_length": 256,
            "differing_bits_on_flip": sha_diff,
            "differing_percent": round(sha_percent, 2),
        },
    }
