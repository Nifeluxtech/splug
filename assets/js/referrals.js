/* SPLUG — refer & earn: referral link, rules, invitees and rewards */
(async function () {
  if (!requireAuthPage()) return;
  mountHeader('referrals'); refreshBalanceChip();
  const $ = (id) => document.getElementById(id);
  let d;
  try { d = await apiCall(API.wallet, { query: { action: 'referrals' } }); }
  catch (err) { toast(err.message, 'error'); return; }

  $('refOff').hidden = d.enabled;
  $('refLink').textContent = d.link || '—';
  $('refCode').textContent = d.code || '—';
  $('refCount').textContent = String(d.invited.length);
  $('refEarned').textContent = naira(d.earned);
  if (d.enabled) $('refLead').textContent = `Invite friends to SPLUG and earn ${d.percent}% of every wallet deposit they make, straight to your wallet.`;

  const rules = [
    `Share your link or code. Friends who sign up with it are linked to you.`,
    `You earn ${d.percent}% of each confirmed deposit they make${d.min_deposit > 0 ? ` of ${nairaShort(d.min_deposit)} or more` : ''}${d.max_per_deposit > 0 ? `, up to ${nairaShort(d.max_per_deposit)} per deposit` : ''}.`,
    d.deposit_limit > 0 ? `Rewards are paid on each friend's first ${d.deposit_limit} deposit${d.deposit_limit > 1 ? 's' : ''}.` : 'Rewards are paid on every deposit they make, for as long as the programme runs.',
    d.welcome_bonus > 0 ? `Your friend gets a ${nairaShort(d.welcome_bonus)} welcome bonus on their first deposit${d.welcome_min_deposit > 0 ? ` of ${nairaShort(d.welcome_min_deposit)} or more` : ''}.` : null,
    'Rewards land in your wallet automatically and can be spent on numbers. They cannot be withdrawn.',
  ].filter(Boolean);
  $('refRules').innerHTML = rules.map((r) => `<li>${esc(r)}</li>`).join('');

  $('refRewards').innerHTML = d.rewards.length
    ? d.rewards.map((t) => `<li class="row txn"><div style="min-width:0"><div class="row-title">${esc(t.description || 'Referral bonus')}</div><div class="row-sub">${esc(fmtDate(t.created_at))}</div></div><div class="row-end"><span class="amount pos">+${naira(t.amount)}</span></div></li>`).join('')
    : `<li>${emptyState({ icon: 'inbox', title: 'No rewards yet', text: 'You earn as soon as a friend you invited funds their wallet.' })}</li>`;
  $('refInvited').innerHTML = d.invited.length
    ? d.invited.map((p) => `<li class="row"><div><div class="row-title">${esc(p.name)}</div><div class="row-sub">Joined ${esc(fmtDate(p.joined))}</div></div></li>`).join('')
    : `<li>${emptyState({ icon: 'inbox', title: 'No friends yet', text: 'Share your link to get started.' })}</li>`;

  $('copyLink').addEventListener('click', (e) => d.link && copyText(d.link, e.currentTarget));
  $('shareLink').addEventListener('click', async () => {
    const text = `Get virtual numbers for SMS verification on SPLUG. Sign up with my link: ${d.link}`;
    if (navigator.share) { try { await navigator.share({ title: 'SPLUG', text, url: d.link }); } catch {} }
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  });
})();
