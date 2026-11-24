/* Ridgeline Coffee – Enhanced Single-Page Checkout. Plain JS, no dependencies, no external network. */
(() => {
  'use strict';

  const MAX_QTY = 99;
  const PROCESSING_MS = 600; // simulated "placing order" delay so double-submit is a real risk
  const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid misreading

  // Prices are integer cents everywhere: no floating-point money maths.
  const PRODUCTS = [
    {
      id: 'beans',
      name: 'Ridge Blend Coffee Beans, 250 g',
      blurb: 'Medium roast with hazelnut and dark cherry notes.',
      priceCents: 1899,
      variants: ['Whole Bean', 'Pour Over (Medium-Fine)', 'Espresso (Fine)', 'French Press (Coarse)'],
      defaultVariant: 'Whole Bean',
    },
    {
      id: 'filters',
      name: 'Paper Filters, pack of 100',
      blurb: 'Size 02 cone filters. Unbleached.',
      priceCents: 449,
      variants: ['Size 02 Unbleached (100 pack)', 'Size 02 Bleached White (100 pack)'],
      defaultVariant: 'Size 02 Unbleached (100 pack)',
    },
  ];
  const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));

  const MSG = {
    emptyCart: 'Your cart is empty. Add an item to place your order.',
    name: 'Enter the name for this order.',
    limit: `The limit is ${MAX_QTY} per item.`,
    badQty: `Quantity must be a whole number from 1 to ${MAX_QTY}.`,
  };

  const PROMO_CODES = {
    RIDGE10: { type: 'percent', value: 10, label: '10% off' },
    COFFEE5: { type: 'fixed', value: 500, label: '$5.00 off' },
    FREESHIP: { type: 'freeship', value: 500, label: 'Free shipping' },
  };

  const POLICIES = {
    refund: {
      title: 'Return & Refund Policy',
      content: '<p><strong>Freshness Guarantee:</strong> If our Ridge Blend Coffee or brew supplies do not meet your standard of excellence, notify us within 14 days of delivery for a 100% full refund or free replacement.</p><p>For food safety and hygiene reasons, coffee beans do not require physical return shipping. For accessories and equipment, complimentary prepaid return labels are provided.</p>',
    },
    cancellation: {
      title: 'Order Cancellation Policy',
      content: '<p>You can cancel your order free of charge at any time within <strong>2 hours</strong> of placement before batch roasting and carrier dispatch.</p><p>To cancel or amend your order, click the customer support helpline at 1-800-RIDGE-COFFEE or reply directly to your order confirmation email.</p>',
    },
    privacy: {
      title: 'Privacy & Terms of Service',
      content: '<p><strong>Customer Privacy:</strong> We strictly respect your privacy. Contact and shipping information (email, phone, address) is collected exclusively to fulfill, track, and provide customer support for your order.</p><p>We never sell, rent, or monetize your details with third parties. All communications and checkout transactions are protected by bank-grade 256-bit TLS encryption.</p>',
    },
  };

  const state = {
    cart: [],
    status: 'idle', // idle | submitting | placed
    fulfillment: 'standard', // standard | express | pickup
    promoCode: null,
    paymentMethod: 'upi',
  };

  // ---------- DOM Elements ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const form = $('#checkout-form');
  const receiptPanel = $('#receipt-panel');
  const productList = $('#product-list');
  const linesEl = $('#cart-lines');
  const cartEmpty = $('#cart-empty');
  const cartNotice = $('#cart-notice');
  const cartError = $('#cart-error');
  const nameInput = $('#customer-name');
  const nameError = $('#name-error');
  const emailInput = $('#customer-email');
  const phoneInput = $('#customer-phone');
  const streetInput = $('#delivery-street');
  const landmarkInput = $('#delivery-landmark');
  const cityInput = $('#delivery-city');
  const stateInput = $('#delivery-state');
  const zipInput = $('#delivery-zip');
  const billingSame = $('#billing-same');
  const billingFields = $('#billing-fields');
  const totalEl = $('#order-total');
  const placeBtn = $('#place-order');
  const btnTotal = $('#btn-total');
  const cartHeading = $('#cart-heading');
  const cartCountBadge = $('#cart-count-badge');
  const confirmations = $('#confirmations');
  const srStatus = $('#sr-status');
  const quickFillBtn = $('#quick-fill-btn');
  const toggleCatalogBtn = $('#toggle-catalog-btn');

  // Promo elements
  const promoInput = $('#promo-input');
  const applyPromoBtn = $('#apply-promo');
  const promoAppliedBox = $('#promo-applied');
  const promoBadgeText = $('#promo-badge-text');
  const removePromoBtn = $('#remove-promo');
  const promoMsg = $('#promo-msg');

  // Breakdown elements
  const breakdownSubtotal = $('#breakdown-subtotal');
  const breakdownDiscountRow = $('#breakdown-discount-row');
  const discountLabel = $('#discount-label');
  const breakdownDiscount = $('#breakdown-discount');
  const breakdownDelivery = $('#breakdown-delivery');
  const breakdownTax = $('#breakdown-tax');

  // Policy Modal elements
  const policyModal = $('#policy-modal');
  const modalTitle = $('#modal-title');
  const modalBody = $('#modal-body');
  const modalCloseBtn = $('#modal-close');
  const modalOkBtn = $('#modal-ok');

  // DOM Builder with textContent only for user safety
  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    node.append(...children);
    return node;
  }

  const money = cents =>
    '$' + Math.floor(cents / 100).toLocaleString('en-US') + '.' + String(cents % 100).padStart(2, '0');

  const findLine = id => state.cart.find(l => l.id === id);
  const lineTotal = line => byId[line.id].priceCents * line.qty;

  // Calculates items subtotal using integer cents
  const subtotalCents = () => state.cart.reduce((sum, l) => sum + lineTotal(l), 0);

  function getFulfillmentFeeCents() {
    if (state.fulfillment === 'express') {
      return state.promoCode === 'FREESHIP' ? 0 : 500;
    }
    return 0; // standard and pickup are free
  }

  function getDiscountCents(subtotal) {
    if (!state.promoCode || !PROMO_CODES[state.promoCode]) return 0;
    const promo = PROMO_CODES[state.promoCode];
    if (promo.type === 'percent') {
      return Math.round(subtotal * (promo.value / 100));
    } else if (promo.type === 'fixed') {
      return Math.min(promo.value, subtotal);
    }
    return 0;
  }

  // Final payable total calculation
  const orderTotal = () => {
    const sub = subtotalCents();
    if (sub === 0) return 0;
    const discount = getDiscountCents(sub);
    const fee = getFulfillmentFeeCents();
    return Math.max(0, sub - discount + fee);
  };

  const say = msg => { srStatus.textContent = msg; };
  const notice = msg => { cartNotice.textContent = msg; };

  function showError(el, msg, input) {
    el.textContent = msg;
    el.hidden = !msg;
    if (input) {
      if (msg) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  // ---------- Products Rendering ----------
  const ICONS = {
    beans: '<svg viewBox="0 0 48 48" aria-hidden="true"><ellipse cx="24" cy="24" rx="12" ry="18" transform="rotate(35 24 24)" fill="currentColor"/><path d="M14 34c8-5 12-13 20-19" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
    filters: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 11h34l-6 27a4 4 0 0 1-4 3H17a4 4 0 0 1-4-3z" fill="currentColor"/><path d="M12 19h24" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>',
  };

  function renderProducts() {
    productList.replaceChildren(...PRODUCTS.map(p => {
      const icon = h('span', { class: 'icon' });
      icon.innerHTML = ICONS[p.id];

      const variantOptions = p.variants.map(v => h('option', { value: v, text: v }));
      const variantSelect = h('select', { class: 'variant-select', id: `variant-${p.id}`, 'aria-label': `Select style for ${p.name}` }, ...variantOptions);
      const variantPicker = h('div', { class: 'variant-picker' },
        h('label', { for: `variant-${p.id}`, text: 'Option:' }),
        variantSelect
      );

      return h('li', { class: 'product', 'data-testid': `product-${p.id}` },
        icon,
        h('div', { class: 'product-info' },
          h('h3', { text: p.name }),
          h('p', { class: 'blurb', text: p.blurb }),
          variantPicker,
          h('p', { class: 'price', 'data-testid': `price-${p.id}`, text: money(p.priceCents) })),
        h('div', { class: 'product-action' },
          h('button', { type: 'button', class: 'secondary add', 'data-id': p.id, 'data-testid': `add-${p.id}` },
            'Add to cart', h('span', { class: 'sr-only', text: `: ${p.name}` })),
          h('span', { class: 'in-cart', 'data-testid': `in-cart-${p.id}`, hidden: true })));
    }));
  }

  // ---------- Cart Rendering ----------
  function renderLine(line) {
    const p = byId[line.id];
    const qty = h('input', {
      class: 'qty-input', type: 'number', inputmode: 'numeric', min: 1, max: MAX_QTY, step: 1,
      value: line.qty, 'aria-label': `Quantity: ${p.name}`, 'data-testid': `qty-${p.id}`,
    });

    const variantTag = h('span', { class: 'line-variant-tag', text: line.variant || p.defaultVariant });

    return h('li', { class: 'line', 'data-id': p.id, 'data-testid': `line-${p.id}` },
      h('div', { class: 'line-head' },
        h('div', {},
          h('span', { class: 'line-name', text: p.name }),
          h('br'),
          variantTag
        ),
        h('span', { class: 'leader', 'aria-hidden': 'true' }),
        h('span', { class: 'line-total', 'data-testid': `line-total-${p.id}` })),
      h('div', { class: 'line-controls' },
        h('span', { class: 'unit', text: `${money(p.priceCents)} each` }),
        h('div', { class: 'stepper' },
          h('button', { type: 'button', class: 'step', 'data-action': 'dec', 'data-testid': `dec-${p.id}`, 'aria-label': `Decrease quantity: ${p.name}` }, '\u2212'),
          qty,
          h('button', { type: 'button', class: 'step', 'data-action': 'inc', 'data-testid': `inc-${p.id}`, 'aria-label': `Increase quantity: ${p.name}` }, '+')),
        h('button', { type: 'button', class: 'remove', 'data-action': 'remove', 'data-testid': `remove-${p.id}`, 'aria-label': `Remove from cart: ${p.name}` }, 'Remove')));
  }

  function renderCart() {
    linesEl.replaceChildren(...state.cart.map(renderLine));
    syncTotals();
  }

  // Updates every number the customer sees without rebuilding inputs (keeps focus and caret)
  function syncTotals() {
    const locked = state.status !== 'idle';
    for (const li of linesEl.children) {
      const line = findLine(li.dataset.id);
      if (!line) continue;
      $('.line-total', li).textContent = money(lineTotal(line));
      $('[data-action="dec"]', li).disabled = locked;
      $('[data-action="inc"]', li).disabled = locked || line.qty >= MAX_QTY;
    }

    const sub = subtotalCents();
    const discount = getDiscountCents(sub);
    const fee = getFulfillmentFeeCents();
    const payable = orderTotal();
    const taxIncluded = Math.round(((sub - discount) * 5) / 105);

    // Order summary breakdown updates
    breakdownSubtotal.textContent = money(sub);
    if (discount > 0) {
      breakdownDiscountRow.hidden = false;
      discountLabel.textContent = state.promoCode;
      breakdownDiscount.textContent = `-${money(discount)}`;
    } else {
      breakdownDiscountRow.hidden = true;
    }

    if (fee === 0) {
      breakdownDelivery.textContent = state.promoCode === 'FREESHIP' && state.fulfillment === 'express' ? 'FREE (PROMO)' : 'FREE';
    } else {
      breakdownDelivery.textContent = money(fee);
    }

    breakdownTax.textContent = money(taxIncluded);

    // Primary totals
    totalEl.textContent = money(payable);
    if (btnTotal) btnTotal.textContent = money(payable);

    const totalItems = state.cart.reduce((n, l) => n + l.qty, 0);
    cartEmpty.hidden = state.cart.length > 0;
    cartCountBadge.hidden = state.cart.length === 0;
    cartCountBadge.textContent = `${totalItems} item${totalItems === 1 ? '' : 's'}`;

    for (const p of PRODUCTS) {
      const badge = $(`[data-testid="in-cart-${p.id}"]`, productList);
      const line = findLine(p.id);
      if (badge) {
        badge.hidden = !line;
        badge.textContent = line ? `${line.qty} in cart` : '';
      }
    }
  }

  function setQty(id, qty, syncInput = true) {
    const line = findLine(id);
    if (!line) return;
    line.qty = qty;
    if (syncInput) {
      const input = $(`.line[data-id="${id}"] .qty-input`, linesEl);
      if (input) input.value = String(qty);
    }
    syncTotals();
  }

  function addItem(id) {
    if (state.status !== 'idle') return;
    notice('');
    showError(cartError, '');
    const line = findLine(id);
    const select = $(`#variant-${id}`, productList);
    const chosenVariant = select ? select.value : byId[id].defaultVariant;

    if (!line) {
      state.cart.push({ id, qty: 1, variant: chosenVariant });
      renderCart();
      say(`${byId[id].name} added. 1 in cart.`);
    } else if (line.qty >= MAX_QTY) {
      notice(MSG.limit);
    } else {
      setQty(id, line.qty + 1);
      say(`${byId[id].name}: ${line.qty} in cart.`);
    }
  }

  // Quantity typing: valid whole numbers apply live; anything else waits until committed
  linesEl.addEventListener('input', e => {
    const input = e.target.closest('.qty-input');
    if (!input) return;
    const id = input.closest('.line').dataset.id;
    const raw = input.value.trim();
    if (!/^\d+$/.test(raw) || parseInt(raw, 10) < 1) return;
    const n = parseInt(raw, 10);
    notice('');
    if (n > MAX_QTY) { setQty(id, MAX_QTY); notice(MSG.limit); }
    else setQty(id, n, false);
  });

  function commitQty(input) {
    const id = input.closest('.line').dataset.id;
    const raw = input.value.trim();
    if (!/^\d+$/.test(raw) || parseInt(raw, 10) < 1) notice(MSG.badQty);
    const line = findLine(id);
    if (line) input.value = String(line.qty);
  }

  linesEl.addEventListener('change', e => {
    if (e.target.closest('.qty-input')) commitQty(e.target);
  });

  linesEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest('.qty-input')) {
      e.preventDefault();
      commitQty(e.target);
    }
  });

  linesEl.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn || state.status !== 'idle') return;
    const id = btn.closest('.line').dataset.id;
    const line = findLine(id);
    notice('');
    if (btn.dataset.action === 'inc' && line.qty < MAX_QTY) {
      setQty(id, line.qty + 1);
    } else if (btn.dataset.action === 'dec') {
      if (line.qty > 1) {
        setQty(id, line.qty - 1);
      } else {
        // decreasing quantity reaches 0 -> remove line item from the cart
        state.cart = state.cart.filter(l => l.id !== id);
        renderCart();
        say(`${byId[id].name} removed from cart.`);
        cartHeading.focus();
      }
    } else if (btn.dataset.action === 'remove') {
      state.cart = state.cart.filter(l => l.id !== id);
      renderCart();
      say(`${byId[id].name} removed from cart.`);
      cartHeading.focus();
    }
  });

  productList.addEventListener('click', e => {
    const btn = e.target.closest('button[data-id]');
    if (btn) addItem(btn.dataset.id);
  });

  // ---------- Promo Code Handling ----------
  function applyPromo(code) {
    const clean = code.trim().toUpperCase();
    if (!clean) {
      promoMsg.className = 'promo-feedback error';
      promoMsg.textContent = 'Please enter a promo code.';
      return;
    }
    if (PROMO_CODES[clean]) {
      state.promoCode = clean;
      promoAppliedBox.hidden = false;
      promoBadgeText.textContent = `${clean} (${PROMO_CODES[clean].label})`;
      promoMsg.className = 'promo-feedback ok';
      promoMsg.textContent = `Promo code applied successfully!`;
      promoInput.value = '';
      syncTotals();
    } else {
      promoMsg.className = 'promo-feedback error';
      promoMsg.textContent = 'Invalid promo code. Try RIDGE10, COFFEE5, or FREESHIP.';
    }
  }

  function removePromo() {
    state.promoCode = null;
    promoAppliedBox.hidden = true;
    promoMsg.className = 'promo-feedback';
    promoMsg.textContent = 'Promo code removed.';
    syncTotals();
  }

  if (applyPromoBtn) {
    applyPromoBtn.addEventListener('click', () => applyPromo(promoInput.value));
  }
  if (promoInput) {
    promoInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyPromo(promoInput.value);
      }
    });
  }
  if (removePromoBtn) {
    removePromoBtn.addEventListener('click', removePromo);
  }

  // ---------- Fulfillment Radio Cards ----------
  $$('input[name="fulfillment"]').forEach(radio => {
    radio.addEventListener('change', () => {
      state.fulfillment = radio.value;
      $$('.option-card').forEach(card => card.classList.remove('active'));
      const activeCard = radio.closest('.option-card');
      if (activeCard) activeCard.classList.add('active');
      syncTotals();
    });
  });

  // ---------- Payment Tabs ----------
  $$('.pay-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      state.paymentMethod = target;
      $$('.pay-tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      $$('.payment-panel').forEach(panel => {
        panel.hidden = true;
        panel.classList.remove('active');
      });
      const activePanel = $(`#tab-${target}`);
      if (activePanel) {
        activePanel.hidden = false;
        activePanel.classList.add('active');
      }
    });
  });

  // ---------- Billing Same Checkbox ----------
  if (billingSame) {
    billingSame.addEventListener('change', () => {
      if (billingFields) billingFields.hidden = billingSame.checked;
    });
  }

  // ---------- Quick Demo Fill Button ----------
  if (quickFillBtn) {
    quickFillBtn.addEventListener('click', () => {
      if (nameInput) nameInput.value = 'Asha Raman';
      if (emailInput) emailInput.value = 'asha.raman@example.com';
      if (phoneInput) phoneInput.value = '+1 (555) 019-2834';
      if (streetInput) streetInput.value = '142 Pine Street, Apt 4B';
      if (landmarkInput) landmarkInput.value = 'Near Pioneer Square Fountain';
      if (cityInput) cityInput.value = 'Seattle';
      if (stateInput) stateInput.value = 'WA';
      if (zipInput) zipInput.value = '98101';
      showError(nameError, '', nameInput);
      say('Sample demo details filled.');
    });
  }

  // Suggestion chips
  $$('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (cityInput) cityInput.value = chip.dataset.city || '';
      if (stateInput) stateInput.value = chip.dataset.state || '';
      if (zipInput) zipInput.value = chip.dataset.zip || '';
    });
  });

  // Toggle catalog collapse
  if (toggleCatalogBtn) {
    toggleCatalogBtn.addEventListener('click', () => {
      const isExpanded = toggleCatalogBtn.getAttribute('aria-expanded') === 'true';
      toggleCatalogBtn.setAttribute('aria-expanded', String(!isExpanded));
      productList.hidden = isExpanded;
      $('.toggle-text', toggleCatalogBtn).textContent = isExpanded ? 'Expand Catalog' : 'Collapse Catalog';
    });
  }

  // ---------- Policy Modals ----------
  $$('.policy-link').forEach(link => {
    link.addEventListener('click', () => {
      const policyKey = link.dataset.policy;
      if (POLICIES[policyKey] && policyModal) {
        modalTitle.textContent = POLICIES[policyKey].title;
        modalBody.innerHTML = POLICIES[policyKey].content;
        policyModal.showModal();
      }
    });
  });

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => policyModal.close());
  if (modalOkBtn) modalOkBtn.addEventListener('click', () => policyModal.close());
  if (policyModal) {
    policyModal.addEventListener('click', e => {
      if (e.target === policyModal) policyModal.close();
    });
  }

  // ---------- Walkthrough Modal ----------
  const walkthroughBtn = $('#open-walkthrough-btn');
  const walkthroughModal = $('#walkthrough-modal');
  const walkthroughCloseBtn = $('#walkthrough-close');
  const walkthroughOkBtn = $('#walkthrough-ok');
  const demoVideoPlayer = $('#demo-video-player');

  function closeWalkthrough() {
    if (demoVideoPlayer) demoVideoPlayer.pause();
    if (walkthroughModal) walkthroughModal.close();
  }

  if (walkthroughBtn && walkthroughModal) {
    walkthroughBtn.addEventListener('click', () => {
      walkthroughModal.showModal();
    });
  }
  if (walkthroughCloseBtn) walkthroughCloseBtn.addEventListener('click', closeWalkthrough);
  if (walkthroughOkBtn) walkthroughOkBtn.addEventListener('click', closeWalkthrough);
  if (walkthroughModal) {
    walkthroughModal.addEventListener('click', e => {
      if (e.target === walkthroughModal) closeWalkthrough();
    });
  }

  // ---------- Checkout Validation & Submission ----------
  nameInput.addEventListener('input', () => {
    if (nameInput.value.trim() !== '') showError(nameError, '', nameInput);
  });

  function setLocked(flag) {
    form.querySelectorAll('input, button, select').forEach(c => { c.disabled = flag; });
    productList.querySelectorAll('button, select').forEach(b => { b.disabled = flag; });
    form.setAttribute('aria-busy', String(flag));
    if (flag) {
      placeBtn.textContent = 'Placing order\u2026';
    } else {
      placeBtn.innerHTML = 'Place order • <span id="btn-total">' + money(orderTotal()) + '</span>';
    }
    syncTotals();
  }

  function makeReference() {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return 'RL-' + Array.from(bytes, b => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
  }

  function buildConfirmation(order, reference) {
    const fulfillmentLabel = order.fulfillment === 'express'
      ? 'Express Priority (1–2 days)'
      : (order.fulfillment === 'pickup' ? 'Store Pickup (Ready in 2h)' : 'Standard Delivery (3–5 days)');

    return h('section', { class: 'panel confirmation', role: 'region', 'aria-label': 'Order confirmation', 'data-testid': 'confirmation' },
      h('h2', { tabindex: '-1', text: 'Order confirmed' }),
      h('p', { class: 'thanks', 'data-testid': 'confirmation-name', text: `Thanks, ${order.name}. We have your order.` }),
      h('p', { class: 'ref' },
        h('span', { text: 'Reference' }),
        h('strong', { 'data-testid': 'order-reference', text: reference })),
      h('div', { class: 'conf-meta-box' },
        h('div', {}, h('strong', { text: 'Fulfillment: ' }), h('span', { text: fulfillmentLabel })),
        h('div', {}, h('strong', { text: 'Payment Method: ' }), h('span', { text: order.paymentMethod.toUpperCase() + ' (Demo Secure)' })),
        order.email ? h('div', {}, h('strong', { text: 'Receipt & Tracking sent to: ' }), h('span', { text: order.email })) : null
      ),
      h('ul', { class: 'lines summary' }, ...order.lines.map(l =>
        h('li', { class: 'summary-line' },
          h('span', { class: 'line-name', text: `${l.qty} \u00d7 ${byId[l.id].name} (${l.variant})` }),
          h('span', { class: 'leader', 'aria-hidden': 'true' }),
          h('span', { class: 'line-total', text: money(byId[l.id].priceCents * l.qty) })))),
      h('div', { class: 'total-row' },
        h('span', { text: 'Order total' }),
        h('strong', { 'data-testid': 'confirmation-total', text: money(order.totalCents) })),
      h('p', { class: 'fine', text: 'Demo store: no payment was taken and nothing will ship.' }),
      h('button', { type: 'button', class: 'secondary', 'data-action': 'new-order' }, 'Start a new order'));
  }

  function completeOrder(order) {
    state.status = 'placed';
    receiptPanel.hidden = true; // the confirmation replaces the receipt; no empty box left behind
    const card = buildConfirmation(order, makeReference());
    confirmations.append(card);
    $('h2', card).focus();
  }

  function placeOrder() {
    if (state.status !== 'idle') return; // MUT:double-submit  (one order per checkout)

    const cartProblem = state.cart.length === 0 ? MSG.emptyCart : '';
    const nameProblem = nameInput.value.trim() === '' ? MSG.name : '';
    showError(cartError, cartProblem);
    showError(nameError, nameProblem, nameInput);
    if (nameProblem) { nameInput.focus(); return; }
    if (cartProblem) { $('button[data-id]', productList).focus(); return; }

    state.status = 'submitting'; // MUT:double-submit
    setLocked(true);             // MUT:double-submit
    const order = {
      name: nameInput.value.trim(),
      email: emailInput ? emailInput.value.trim() : '',
      fulfillment: state.fulfillment,
      paymentMethod: state.paymentMethod,
      lines: state.cart.map(l => ({ ...l })), // snapshot at click time
      totalCents: orderTotal(),
    };
    setTimeout(() => completeOrder(order), PROCESSING_MS);
  }

  form.addEventListener('submit', e => { e.preventDefault(); placeOrder(); });

  confirmations.addEventListener('click', e => {
    if (!e.target.closest('[data-action="new-order"]')) return;
    confirmations.replaceChildren();
    state.cart = [];
    state.status = 'idle';
    state.promoCode = null;
    state.fulfillment = 'standard';
    nameInput.value = '';
    if (emailInput) emailInput.value = '';
    if (phoneInput) phoneInput.value = '';
    if (streetInput) streetInput.value = '';
    if (cityInput) cityInput.value = '';
    if (stateInput) stateInput.value = '';
    if (zipInput) zipInput.value = '';
    if (promoAppliedBox) promoAppliedBox.hidden = true;
    if (promoMsg) promoMsg.textContent = '';
    showError(cartError, '');
    showError(nameError, '', nameInput);
    notice('');
    receiptPanel.hidden = false;
    renderCart(); // rebuild first: setLocked() re-syncs totals and must not see stale lines
    setLocked(false);
    cartHeading.focus();
  });

  renderProducts();
  renderCart();
})();
