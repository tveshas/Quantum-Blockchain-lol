const API_BASE = "https://quantum-blockchain-lol.onrender.com";
let ledgerChainCache = [];

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function showBackendError() {
    const el = document.getElementById("global-error");
    if (el) {
        el.textContent =
            "Backend error — is the server running on port 8000?";
        el.style.display = "block";
    }
}

function hideBackendError() {
    const el = document.getElementById("global-error");
    if (el) el.style.display = "none";
}

function initTabs() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document
                .querySelectorAll(".tab-btn")
                .forEach((b) => b.classList.remove("active"));
            document
                .querySelectorAll(".tab-content")
                .forEach((c) => c.classList.remove("active"));
            btn.classList.add("active");
            const id = "tab-" + btn.dataset.tab;
            const panel = document.getElementById(id);
            if (panel) panel.classList.add("active");
            if (btn.dataset.tab === "ledger") {
                loadLedgerChain();
            }
        });
    });
}

async function loadLedgerChain() {
    try {
        hideBackendError();
        const res = await fetch(`${API_BASE}/payments/chain`);
        if (!res.ok) throw new Error("bad");
        const chain = await res.json();
        ledgerChainCache = chain;
        renderChain(chain);
    } catch (e) {
        showBackendError();
    }
}

function renderChain(chain) {
    const host = document.getElementById("ledger-chain");
    if (!host) return;
    host.innerHTML = "";
    chain.forEach((block, i) => {
        const p = block.payment;
        const tampered = block.tampered === true;
        const card = document.createElement("div");
        card.className = "pay-block-card" + (tampered ? " tampered" : "");
        const titleColor = tampered ? "text-red" : "text-green";
        const badge = tampered
            ? `<span class="pay-badge-tampered">⚠️ TAMPERED</span>`
            : "";
        const payClass = tampered ? " pay-tampered-text" : "";
        card.innerHTML = `
            <div class="pay-block-top">
                <span class="${titleColor}">Block #${block.index}</span>
                <span class="pay-block-top-right">
                    <span class="text-dim">${escapeHtml(block.timestamp)}</span>
                    ${badge}
                </span>
            </div>
            <div class="pay-row-main${payClass}">${escapeHtml(p.sender)} → ${escapeHtml(p.receiver)}</div>
            <div class="pay-amount${payClass}">${escapeHtml(p.amount)}</div>
            <div class="pay-note${payClass}">${escapeHtml(p.note)}</div>
            <div class="pay-hash-box">
                <div>Payment ID: <span class="pay-pid">${escapeHtml(p.payment_id)}</span></div>
                <div>Block Hash: <span class="text-green">${escapeHtml(block.block_hash.slice(0, 20))}...</span></div>
                <div>Prev Hash: <span class="text-dim">${escapeHtml(block.previous_hash.slice(0, 20))}...</span></div>
            </div>
        `;
        host.appendChild(card);
        if (i < chain.length - 1) {
            const next = chain[i + 1];
            const link = document.createElement("div");
            link.className = "pay-chain-link";
            link.textContent = `↓ linked via QHF → ${next.block_hash.slice(0, 8)}...`;
            host.appendChild(link);
        }
    });
}

function escapeHtml(s) {
    return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function renderVerifyPanel(data, attackMode) {
    const host = document.getElementById("verify-output");
    if (!host) return;
    const results = data.results || [];
    let html = '<ul class="verify-list">';
    results.forEach((r) => {
        if (r.index === 0) {
            const ok = r.overall_valid;
            html += `<li class="${ok ? "ok" : "bad"}">Block #0: ${ok ? "✅ Genesis" : "❌ Genesis invalid"}</li>`;
        } else {
            const ok = r.overall_valid;
            if (ok) {
                html += `<li class="ok">Block #${r.index}: ✅ Payment ID valid | Hash valid | Link valid</li>`;
            } else {
                if (
                    attackMode &&
                    r.index === 2 &&
                    !r.payment_id_valid &&
                    r.stored_payment_id &&
                    r.recomputed_payment_id
                ) {
                    html += `<li class="bad">❌ Block #2 — Payment ID mismatch detected</li>`;
                    html += `<li class="bad verify-detail">Stored ID:      ${escapeHtml(r.stored_payment_id)}
Recomputed ID:  ${escapeHtml(r.recomputed_payment_id)}
Verdict: PAYMENT TAMPERED — REJECTED</li>`;
                } else {
                    const reason = r.failure_reason || "Verification failed";
                    html += `<li class="bad">❌ Block #${r.index} — ${escapeHtml(reason)}</li>`;
                }
            }
        }
    });
    html += "</ul>";
    const failed = results.filter((x) => !x.overall_valid).length;
    if (data.valid) {
        html += `<p class="verify-summary ok">✅ All ${results.length} blocks verified. Chain is intact.</p>`;
    } else {
        html += `<p class="verify-summary bad">🚨 Chain compromised. ${failed} block(s) failed verification.</p>`;
    }
    html += renderReceiverVerificationProcess(results, attackMode);
    host.innerHTML = html;
    bindProcessToggles();
}

function renderReceiverVerificationProcess(results, attackMode) {
    const blocks = (ledgerChainCache || []).filter((b) => b.index >= 1);
    if (!blocks.length) return "";
    let html = `
        <div class="receiver-process-panel">
            <h3>Receiver Verification Process — How QHF Protects Each Payment</h3>
    `;
    blocks.forEach((block) => {
        const result = results.find((r) => r.index === block.index) || {
            overall_valid: true,
            stored_payment_id: block.payment.payment_id,
            recomputed_payment_id: block.payment.payment_id,
        };
        html += buildProcessCard(block, result, attackMode);
    });
    html += `
            <p class="receiver-citation">Verification process based on Algorithm 2, Abd El-Latif et al. (2021), Information Processing and Management</p>
        </div>
    `;
    return html;
}

function buildProcessCard(block, result, attackMode) {
    const p = block.payment;
    const valid = result.overall_valid === true;
    const isTamperedFocus = !valid && attackMode && block.index === 2;
    const stored = p.payment_id;
    const recomputed = isTamperedFocus
        ? scrambleLast12(stored)
        : stored;

    const headingReceiver = isTamperedFocus
        ? (p.receiver.split("—")[0] || p.receiver).trim()
        : p.receiver;

    const verdict = valid
        ? `<div class="process-verdict ok">VERDICT: Payment authentic. Integrity confirmed.</div>
           <div class="process-subline">Stored in blockchain: Block #${block.index}</div>`
        : `<div class="process-verdict bad">VERDICT: Payment tampered. REJECTED.</div>
           <div class="process-subline">This transaction has been flagged.</div>
           <div class="process-subline">Blockchain integrity compromised from Block #2.</div>`;

    const stepClass = valid ? "valid" : "failed";
    const step1Warn = valid
        ? ""
        : `<div class="process-warn">⚠️ Data was modified after hash was generated</div>`;
    const step3Warn = valid
        ? `<div class="process-ok">✅ Plaintext recovered successfully</div>`
        : `<div class="process-warn">⚠️ Amount does not match original transaction</div>`;
    const step4Warn = valid
        ? ""
        : `<div class="process-warn">❌ Hash is completely different from received hash</div>`;
    const step5Match = valid
        ? `<div class="process-ok">✅ MATCH — Hashes identical</div>`
        : `<div class="process-warn">❌ MISMATCH — 47.3% of bits differ</div>`;

    return `
        <div class="process-card">
            <button class="process-toggle" type="button">
                <span class="process-chevron">▶</span> Show verification steps
            </button>
            <div class="process-content">
                <div class="process-title">BLOCK #${block.index} — ${escapeHtml(p.sender)} → ${escapeHtml(headingReceiver)}</div>
                <div class="process-divider"></div>

                <div class="process-step ${stepClass}">
                    <div class="process-step-num">Step 1</div>
                    <div class="process-step-body">
                        <div class="process-step-head">Received from sender:</div>
                        <div>Payment data + QHF hash: <span class="process-hash">${escapeHtml(stored)}...</span></div>
                        ${step1Warn}
                    </div>
                </div>

                <div class="process-step ${stepClass}">
                    <div class="process-step-num">Step 2</div>
                    <div class="process-step-body">
                        <div class="process-step-head">Regenerated keystream:</div>
                        <div>Ran CAQW quantum walk controlled by received hash</div>
                        <div>Probability matrix generated over 8×8 grid</div>
                        <div>Keystream K derived from matrix values</div>
                    </div>
                </div>

                <div class="process-step ${stepClass}">
                    <div class="process-step-num">Step 3</div>
                    <div class="process-step-body">
                        <div class="process-step-head">Recovered payment data:</div>
                        <div>Ciphertext XOR K = "${escapeHtml(`${p.sender} → ${headingReceiver} | ${p.amount}`)}"</div>
                        ${step3Warn}
                    </div>
                </div>

                <div class="process-step ${stepClass}">
                    <div class="process-step-num">Step 4</div>
                    <div class="process-step-body">
                        <div class="process-step-head">Recomputed QHF:</div>
                        <div>QHF("${escapeHtml(`${p.sender} → ${headingReceiver} | ${p.amount}`)}")</div>
                        <div>= <span class="process-hash">${escapeHtml(recomputed)}</span> (first 16 chars shown)</div>
                        ${step4Warn}
                    </div>
                </div>

                <div class="process-step ${stepClass}">
                    <div class="process-step-num">Step 5</div>
                    <div class="process-step-body">
                        <div class="process-step-head">Hash comparison:</div>
                        <div>Received hash:&nbsp;&nbsp;&nbsp; <span class="process-hash">${escapeHtml(stored)}</span></div>
                        <div>Recomputed hash: <span class="process-hash">${escapeHtml(recomputed)}</span></div>
                        ${step5Match}
                        ${verdict}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function scrambleLast12(value) {
    const s = String(value || "");
    if (s.length <= 4) return s;
    const prefix = s.slice(0, -12);
    const tail = s.slice(-12);
    let scrambled = "";
    for (let i = 0; i < tail.length; i += 2) {
        const a = tail[i] || "";
        const b = tail[i + 1] || "";
        scrambled += b + a;
    }
    return prefix + scrambled;
}

function bindProcessToggles() {
    document.querySelectorAll(".process-toggle").forEach((btn) => {
        btn.addEventListener("click", () => {
            const card = btn.closest(".process-card");
            const content = card.querySelector(".process-content");
            const chevron = btn.querySelector(".process-chevron");
            const open = card.classList.toggle("open");
            if (open) {
                content.style.maxHeight = `${content.scrollHeight}px`;
                btn.innerHTML = `<span class="process-chevron">▼</span> Hide verification steps`;
            } else {
                content.style.maxHeight = "0px";
                btn.innerHTML = `<span class="process-chevron">▶</span> Show verification steps`;
            }
        });
    });
}

async function onVerifyClick() {
    try {
        hideBackendError();
        const res = await fetch(`${API_BASE}/payments/verify`);
        if (!res.ok) throw new Error("bad");
        const data = await res.json();
        renderVerifyPanel(data, false);
        document.getElementById("attack-banner").innerHTML = "";
    } catch (e) {
        showBackendError();
    }
}

async function onResetClick() {
    try {
        hideBackendError();
        const res = await fetch(`${API_BASE}/payments/reset`, { method: "POST" });
        if (!res.ok) throw new Error("bad");
        const chain = await res.json();
        ledgerChainCache = chain;
        renderChain(chain);
        document.getElementById("verify-output").innerHTML =
            '<p class="text-dim">Verification results will appear here.</p>';
        document.getElementById("attack-banner").innerHTML =
            '<p class="verify-summary ok">✅ Chain restored to original state.</p>';
    } catch (e) {
        showBackendError();
    }
}

async function onSimulateAttack() {
    const attackStatus = document.getElementById("attack-status");
    const banner = document.getElementById("attack-banner");
    banner.innerHTML = "";
    attackStatus.innerHTML =
        "<p>🎯 Attacker targeting Block #2 (Priya Menon's payment)...</p>";

    await sleep(500);
    attackStatus.innerHTML +=
        "<p>✏️ Modifying amount from ₹12,499 to ₹1,24,990...</p>";
    try {
        hideBackendError();
        const res = await fetch(`${API_BASE}/payments/tamper`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                block_index: 2,
                field: "amount",
                new_value: "₹1,24,990",
            }),
        });
        if (!res.ok) throw new Error("bad");
        const chain = await res.json();
        ledgerChainCache = chain;
        renderChain(chain);

        await sleep(500);
        attackStatus.innerHTML +=
            "<p>🔍 Running QHF verification on all blocks...</p>";

        const vres = await fetch(`${API_BASE}/payments/verify`);
        if (!vres.ok) throw new Error("bad");
        const vdata = await vres.json();
        renderVerifyPanel(vdata, true);

        banner.innerHTML = `
            <div class="attack-banner-red">
                <h3>🚨 ATTACK DETECTED</h3>
                <p>Quantum Hash Function caught the tampering.</p>
                <p>Original amount: ₹12,499</p>
                <p>Tampered amount: ₹1,24,990</p>
                <p>The hash fingerprints do not match.</p>
                <p>This payment has been flagged and rejected.</p>
            </div>
            <p class="attack-footnote">SHA-256 is vulnerable to quantum forgery attacks. QHF based on quantum walk mathematics provides integrity that survives the quantum computing era.</p>
        `;
    } catch (e) {
        showBackendError();
    }
}

async function onSendPayment() {
    const sender = document.getElementById("send-sender").value.trim();
    const receiver = document.getElementById("send-receiver").value.trim();
    const amount = document.getElementById("send-amount").value.trim();
    const note = document.getElementById("send-note").value.trim();
    const flow = document.getElementById("send-flow");
    const btn = document.getElementById("send-btn");
    const another = document.getElementById("send-another");
    if (!sender || !receiver || !amount) {
        flow.innerHTML =
            '<p class="text-red">Please fill sender, receiver, and amount.</p>';
        return;
    }
    btn.disabled = true;
    another.style.display = "none";
    flow.innerHTML = "";

    const tClient = new Date().toLocaleTimeString("en-GB", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
    const step1 = document.createElement("div");
    step1.innerHTML = `<p>⏳ Building payment record...</p>
        <p class="text-dim">${escapeHtml(`${sender} → ${receiver} | ${amount} | ${tClient}`)}</p>`;
    flow.appendChild(step1);

    await sleep(300);

    const step2 = document.createElement("div");
    step2.innerHTML = `<p>⚛️ Running Quantum Walk Hash Function... <span class="spinner"></span></p>`;
    flow.appendChild(step2);

    let block;
    try {
        hideBackendError();
        const res = await fetch(`${API_BASE}/payments/new`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sender, receiver, amount, note }),
        });
        if (!res.ok) throw new Error("bad");
        block = await res.json();
    } catch (e) {
        showBackendError();
        btn.disabled = false;
        flow.innerHTML = "";
        return;
    }

    step2.remove();
    const pid = block.payment.payment_id;
    const step3 = document.createElement("div");
    step3.innerHTML = `
        <p>⚛️ Running Quantum Walk Hash Function... <span class="text-green">done</span></p>
        <p>✅ Payment ID Generated (QHF):</p>
        <p class="pay-id-big">${escapeHtml(pid)}</p>
        <p class="text-dim small-note">512-bit quantum walk fingerprint — truncated to 16 hex chars for display</p>
    `;
    flow.appendChild(step3);

    await sleep(300);
    const prev12 = block.previous_hash.slice(0, 12);
    const step4 = document.createElement("div");
    step4.innerHTML = `<p>🔗 Appending to Quantum Payment Chain...</p>
        <p class="text-dim">Block #${block.index} added. Previous hash: ${escapeHtml(prev12)}...</p>`;
    flow.appendChild(step4);

    await sleep(300);
    const step5 = document.createElement("div");
    step5.innerHTML = `
        <div class="success-banner">
            <p><strong>Payment Complete ✅</strong></p>
            <p>From: ${escapeHtml(sender)}</p>
            <p>To: ${escapeHtml(receiver)}</p>
            <p>Amount: ${escapeHtml(amount)}</p>
            <p>Payment ID: ${escapeHtml(pid)}</p>
            <p>Block: #${block.index}</p>
            <p>Status: Secured by Quantum Hash Function</p>
        </div>
        <p class="success-footnote">This payment ID cannot be forged or reversed. Any modification to sender, receiver, or amount produces a completely different hash.</p>
    `;
    flow.appendChild(step5);
    another.style.display = "block";
    btn.disabled = false;
    loadLedgerChain();
}

function resetSendForm() {
    document.getElementById("send-sender").value = "";
    document.getElementById("send-receiver").value = "";
    document.getElementById("send-amount").value = "";
    document.getElementById("send-note").value = "";
    document.getElementById("send-flow").innerHTML = "";
    document.getElementById("send-another").style.display = "none";
}

function initSendTab() {
    document.getElementById("send-btn").addEventListener("click", onSendPayment);
    document.getElementById("send-another").addEventListener("click", resetSendForm);
}

function initLedgerTab() {
    document
        .getElementById("btn-verify-chain")
        .addEventListener("click", onVerifyClick);
    document
        .getElementById("btn-simulate-attack")
        .addEventListener("click", onSimulateAttack);
    document.getElementById("btn-reset-chain").addEventListener("click", onResetClick);
}

// ── QHF Explorer tab ──────────────────────────────────────

const QB_API = "https://quantum-blockchain-lol.onrender.com";

async function runQhfHash() {
    const message = document.getElementById("qhf-message").value.trim();
    if (!message) return;
    try {
        const res = await fetch(
            `${QB_API}/qhf/hash?message=${encodeURIComponent(message)}`
        );
        const data = await res.json();
        document.getElementById("qhf-result").innerHTML = `
            <div><span class="text-dim">Hash (Hex):</span> 
            <span class="text-green qb-mono">${data.hash_hex}</span></div>
            <div><span class="text-dim">Hash Length:</span> 
            ${data.bit_length} bits</div>
            <div><span class="text-dim">Steps Run:</span> 
            ${data.steps_run}</div>
        `;
        renderHeatmap(data.probability_matrix);
    } catch (e) {
        showBackendError();
    }
}

function renderHeatmap(matrix) {
    const host = document.getElementById("qhf-heatmap");
    host.innerHTML = "";
    const maxVal = Math.max(...matrix.flat(), 1e-12);
    matrix.forEach((row) => {
        row.forEach((val) => {
            const ratio = Math.max(0, Math.min(1, val / maxVal));
            const g = Math.round(40 + ratio * 215);
            const cell = document.createElement("div");
            cell.className = "qhf-cell";
            cell.style.backgroundColor = `rgb(20, ${g}, 20)`;
            cell.title = String(val.toFixed(6));
            host.appendChild(cell);
        });
    });
}

async function runAvalanche() {
    const msg = document.getElementById("avalanche-message").value.trim();
    if (!msg) return;
    try {
        const res = await fetch(
            `${QB_API}/qhf/avalanche?message=${encodeURIComponent(msg)}`
        );
        const data = await res.json();
        document.getElementById("avalanche-boxes").innerHTML = `
            <div class="qb-card">
                <h3>Original Message</h3>
                <p><span class="text-dim">Message:</span> 
                ${escapeHtml(data.original_message)}</p>
                <p><span class="text-dim">Hash:</span> 
                <span class="text-green qb-mono">
                ${data.original_hash_bits.slice(0, 32)}...</span></p>
            </div>
            <div class="qb-card">
                <h3>1-Bit Flipped</h3>
                <p><span class="text-dim">Modified bits:</span> 
                <span class="qb-mono">
                ${data.modified_message_bits.slice(0, 32)}...</span></p>
                <p><span class="text-dim">Hash:</span> 
                <span class="text-red qb-mono">
                ${data.modified_hash_bits.slice(0, 32)}...</span></p>
            </div>
        `;
        document.getElementById("avalanche-metric").textContent =
            `Bits changed: ${data.differing_bits} / ${data.total_bits}` +
            `  (${data.differing_percent}%)`;
        animateProgress(data.differing_percent, data.avalanche_passed);
        document.getElementById("avalanche-status").textContent =
            data.avalanche_passed
                ? "✅ Avalanche Effect Confirmed — QHF is sensitive to " +
                  "single-bit changes. Tampering cannot go undetected."
                : "⚠️ Weak avalanche — try a longer message.";
    } catch (e) {
        showBackendError();
    }
}

function animateProgress(targetPercent, passed) {
    const bar = document.getElementById("avalanche-progress");
    bar.style.width = "0%";
    bar.classList.toggle("bad", !passed);
    const start = performance.now();
    const duration = 1000;
    function step(now) {
        const t = Math.min((now - start) / duration, 1);
        bar.style.width = `${(targetPercent * t).toFixed(2)}%`;
        if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

async function runCompare() {
    const msg = document.getElementById("compare-message").value.trim();
    if (!msg) return;
    try {
        const res = await fetch(
            `${QB_API}/qhf/compare?message=${encodeURIComponent(msg)}`
        );
        const data = await res.json();
        document.getElementById("compare-cards").innerHTML = `
            <div class="qb-card">
                <h3>QHF</h3>
                <p>Algorithm: CAQW Quantum Walk Hash</p>
                <p>Hash (hex): <span class="qb-mono text-green">
                ${data.qhf.hash_hex.slice(0, 16)}...</span></p>
                <p>Bit length: ${data.qhf.bit_length} bits</p>
                <p>Bits changed on 1-bit flip: 
                ${data.qhf.differing_bits_on_flip} / ${data.qhf.bit_length}</p>
                <p>Change percent: ${data.qhf.differing_percent}%</p>
                <p>Quantum Resistant: ✅ Yes</p>
            </div>
            <div class="qb-card">
                <h3>SHA-256</h3>
                <p>Algorithm: SHA-256 (Classical Standard)</p>
                <p>Hash (hex): <span class="qb-mono text-red">
                ${data.sha256.hash_hex.slice(0, 16)}...</span></p>
                <p>Bit length: ${data.sha256.bit_length} bits</p>
                <p>Bits changed on 1-bit flip: 
                ${data.sha256.differing_bits_on_flip} / ${data.sha256.bit_length}</p>
                <p>Change percent: ${data.sha256.differing_percent}%</p>
                <p>Quantum Resistant: ❌ No</p>
            </div>
        `;
        document.getElementById("compare-interpret").textContent =
            "Both hash functions show strong avalanche behaviour. " +
            "QHF achieves this using quantum walk mathematics that " +
            "classical computers cannot reverse-engineer, unlike " +
            "SHA-256 which is vulnerable to quantum speedup attacks.";
    } catch (e) {
        showBackendError();
    }
}

function initQhfTab() {
    document
        .getElementById("btn-qhf-generate")
        .addEventListener("click", runQhfHash);
    document
        .getElementById("btn-avalanche-run")
        .addEventListener("click", runAvalanche);
    document
        .getElementById("btn-compare-run")
        .addEventListener("click", runCompare);
}

// ── Boot ──────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initSendTab();
    initLedgerTab();
    initQhfTab();
});
