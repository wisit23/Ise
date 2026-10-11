// Demonstration transactions go through the same HTTP APIs as the application.
// Checkpoints make reruns resume completed steps instead of duplicating orders.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const env = require('dotenv').parse(fs.readFileSync('.env'));
const label = process.env.LOCAL_DATASET_LABEL || '20261011';
if (!env.DATABASE_URL_ORDER.includes('/reloop_demo_' + label + '_order')) throw new Error('Refusing to seed a non-demo Order database');
const base = 'http://127.0.0.1:' + (env.GATEWAY_PORT || 8080);
const output = path.join('tmp', 'local-dataset-' + label);
fs.mkdirSync(output, { recursive: true });
const checkpoint = path.join(output, 'workflow-checkpoints.json');
const state = fs.existsSync(checkpoint) ? JSON.parse(fs.readFileSync(checkpoint)) : {};
async function step(key, action) {
  if (Object.hasOwn(state, key)) return state[key];
  const result = await action(); state[key] = result;
  fs.writeFileSync(checkpoint, JSON.stringify(state, null, 2));
  console.log(key + ' completed'); return result;
}
async function request(route, token, body, method = body ? 'POST' : 'GET', expected) {
  const form = body instanceof FormData;
  const response = await fetch(base + route, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(!form && body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: form ? body : JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  const raw = await response.text(); let data; try { data = raw ? JSON.parse(raw) : null; } catch { throw new Error(method + ' ' + route + ' returned ' + response.status + ': ' + raw.slice(0, 150)); }
  if (expected) assert.equal(response.status, expected, route + ': ' + JSON.stringify(data));
  else assert.ok(response.ok, method + ' ' + route + ': ' + response.status + ' ' + JSON.stringify(data));
  return data;
}
async function inspectionImage(orderId, productId) {
  const lines = ['DEMONSTRATION buyer inspection statement', 'Order: ' + orderId, 'Product: ' + productId, 'Scenario: item condition differs from the listing.', 'Reported issue: damaged seam after receipt.', 'This is newly generated demo evidence, not historical customer data.'];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="430"><rect width="1100" height="430" fill="white"/>' + lines.map((line, i) => '<text x="35" y="' + (55 + i * 55) + '" font-family="sans-serif" font-size="22" fill="#0f172a">' + line + '</text>').join('') + '</svg>';
  return new Blob([await require('sharp')(Buffer.from(svg)).png().toBuffer()], { type: 'image/png' });
}
async function main() {
  const emails = { buyer: 'buyer.demo@example.com', seller: 'shop.denim@example.com', cs: 'cs.nan@example.com', otherCs: 'cs.beam@example.com', admin: 'admin@example.com', trust: 'trust.demo@example.com', marketing: 'marketing@example.com', executive: 'ceo@example.com' };
  const accounts = {}; for (const [role, email] of Object.entries(emails)) accounts[role] = await request('/api/auth/login', null, { email, password: 'password123' });
  const token = role => accounts[role].accessToken;
  const address = await step('buyer-address', () => request('/api/auth/me/addresses', token('buyer'), { recipientName: 'สมชาย ผู้ซื้อสาธิต', phone: '0800000000', addressLine: '99 ถนนตัวอย่าง', subdistrict: 'ปทุมวัน', district: 'ปทุมวัน', province: 'กรุงเทพมหานคร', postalCode: '10330' }));
  const imageDir = path.join('frontend', 'public', 'demo'); fs.mkdirSync(imageDir, { recursive: true });
  const photos = ['front', 'back', 'seam', 'label'].map((view, index) => {
    const filename = 'denim-' + view + '.svg';
    fs.writeFileSync(path.join(imageDir, filename), `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="#f1f5f9"/><path d="M210 120L130 165L70 300L155 330L195 245V480H405V245L445 330L530 300L470 165L390 120L340 155H260Z" fill="${['#31577d','#426b94','#385f87','#244564'][index]}" stroke="#18354e" stroke-width="5"/><path d="M300 160V480M195 360H405" fill="none" stroke="#d4b489" stroke-dasharray="6 5" stroke-width="3"/><text x="300" y="65" text-anchor="middle" font-family="sans-serif" font-size="24">DEMO DENIM — ${view.toUpperCase()}</text><text x="300" y="550" text-anchor="middle" font-family="sans-serif" font-size="18">Illustration for demonstration data</text></svg>`);
    return { url: '/demo/' + filename, type: 'image' };
  });
  async function product(key, title) { return step(key + '-product', () => request('/api/products', token('seller'), { title, description: 'เสื้อแจ็กเก็ตยีนส์มือสองในชุดสาธิต มีภาพรายละเอียดสี่มุม', price: 890, category: 'เสื้อผ้า', brand: 'Demo Denim', condition: 'Good', size: 'M', location: 'กรุงเทพมหานคร', media: photos.slice(0, 4), tags: ['demo', 'denim'] })); }
  const campaign = await step('campaign-draft', () => request('/api/products/campaigns', token('marketing'), { code: 'LOCAL' + label, name: 'สาธิตส่วนลดซื้อสินค้ามือสอง', discountType: 'PERCENT', discountValue: 10, minOrderPrice: 100, maxDiscount: 100, budget: 10000, usageLimit: 100, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 30 * 86400000).toISOString() }));
  for (const action of ['submit', 'approve', 'publish']) await step('campaign-' + action, () => request('/api/products/campaigns/' + campaign.id + '/' + action, token('marketing'), {}));
  await step('buyer-voucher', () => request('/api/products/campaigns/' + campaign.id + '/claim', token('buyer'), {}));
  const scenarios = [
    ['pending', 'รอชำระเงิน', 'pending'], ['paid', 'รอผู้ขายจัดส่ง', 'paid'], ['shipped', 'อยู่ระหว่างจัดส่ง', 'shipped'],
    ['completed', 'ผู้ซื้อรับสินค้าและรีวิวแล้ว', 'completed'], ['unassigned', 'ข้อพิพาทรอ CS รับ', 'unassigned'], ['cs', 'CS กำลังรวบรวมหลักฐาน', 'cs'], ['admin', 'ส่งต่อให้ Admin ตัดสิน', 'admin'], ['refunded', 'Admin อนุมัติคืนเงินแล้ว', 'refunded'], ['safety', 'T&S พักเงินเพื่อตรวจสอบ', 'safety'],
  ];
  const createdOrders = [];
  for (const [key, title, stage] of scenarios) {
    const listing = await product(key, 'DEMO แจ็กเก็ตยีนส์ · ' + title);
    const room = await step(key + '-trade-room', () => request('/api/chat/conversations', token('buyer'), { contextType: 'PRODUCT', productId: listing.id }));
    await step(key + '-buyer-inquiry', () => request('/api/chat/conversations/' + room.id + '/messages', token('buyer'), { body: 'ขอสอบถามสภาพเสื้อและขนาด M ก่อนสั่งซื้อครับ' }));
    await step(key + '-seller-answer', () => request('/api/chat/conversations/' + room.id + '/messages', token('seller'), { body: 'เป็นเสื้อมือสองสภาพ Good ขนาด M ตามภาพ สามารถสั่งซื้อผ่านระบบได้ครับ' }));
    const order = await step(key + '-order', () => request('/api/orders', token('buyer'), { productId: listing.id, ...(key === 'completed' ? { campaignId: campaign.id } : {}) }));
    const checkout = await step(key + '-checkout', () => request('/api/orders/checkout-sessions', token('buyer'), { orderIds: [order.id], addressId: address.id, shippingAddress: address }));
    if (stage !== 'pending') {
      await step(key + '-payment', () => request('/api/orders/checkout-sessions/' + checkout.id + '/confirm', token('buyer'), {}));
      if (!['paid', 'safety'].includes(stage)) {
        await step(key + '-shipping', async () => { const current = await request('/api/orders/' + order.id, token('seller')); return request('/api/orders/' + order.id + '/status', token('seller'), { status: 'shipped', company: 'Demo Express', trackingNumber: 'DEMO-' + label + '-' + key.toUpperCase(), version: current.version }, 'PATCH'); });
        if (stage !== 'shipped') await step(key + '-receipt', async () => { const current = await request('/api/orders/' + order.id, token('buyer')); return request('/api/orders/' + order.id + '/status', token('buyer'), { status: 'completed', version: current.version }, 'PATCH'); });
      }
      if (stage === 'completed') await step('buyer-review', () => request('/api/products/reviews', token('buyer'), { orderId: order.id, rating: 5, comment: 'ได้รับเสื้อแล้ว สภาพตรงตามรายละเอียด ผู้ขายตอบคำถามและจัดส่งเรียบร้อย' }));
      if (stage === 'safety') await step('safety-hold', async () => { const current = await request('/api/orders/' + order.id, token('seller')); return request('/api/orders/admin/' + order.id + '/hold', token('trust'), { reason: 'ชุดสาธิต: พักเงินเพื่อตรวจสอบรายการที่ได้รับรายงาน ก่อนอนุญาตให้จัดส่ง', version: current.version }); });
      if (['unassigned', 'cs', 'admin', 'refunded'].includes(stage)) {
        const dispute = await step(key + '-dispute', () => request('/api/orders/' + order.id + '/disputes', token('buyer'), { reason: 'ชุดสาธิต: หลังรับสินค้าพบตะเข็บชำรุด ไม่ตรงสภาพที่ผู้ขายแจ้ง ขอให้ตรวจหลักฐาน', disputeType: 'ITEM_NOT_AS_DESCRIBED' }));
        const evidence = await step(key + '-evidence', async () => { const form = new FormData(); form.append('file', await inspectionImage(order.id, listing.id), 'demo-inspection-' + key + '.png'); return request('/api/orders/disputes/' + dispute.id + '/evidence', token('buyer'), form); });
        if (stage !== 'unassigned') {
          await step(key + '-cs-claim', async () => { const current = await request('/api/orders/disputes/' + dispute.id, token('cs')); return request('/api/orders/disputes/' + dispute.id + '/claim', token('cs'), { version: current.version }); });
          if (stage === 'cs') await step(key + '-manual-evidence-deadline', () => request('/api/orders/disputes/' + dispute.id + '/evidence/' + evidence.id + '/deadline', token('cs'), { version: evidence.version, deadline: new Date(Date.now() + 48 * 3600000).toISOString() }, 'PATCH'));
          if (['admin', 'refunded'].includes(stage)) await step(key + '-escalation', async () => { const current = await request('/api/orders/disputes/' + dispute.id, token('cs')); return request('/api/orders/disputes/' + dispute.id + '/escalate', token('cs'), { version: current.version, reason: 'ปัญหา: สภาพสินค้าไม่ตรงรายละเอียด\nขาดอำนาจ: CS ไม่สามารถตัดสินเงิน\nข้อเสนอแนะ: ตรวจเอกสารผู้ซื้อและพิจารณาคืนเงิน' }); });
          if (stage === 'refunded') {
            await step(key + '-admin-claim', async () => { const current = await request('/api/orders/disputes/' + dispute.id, token('admin')); return request('/api/orders/disputes/' + dispute.id + '/claim', token('admin'), { version: current.version }); });
            await step(key + '-verdict', async () => { const current = await request('/api/orders/disputes/' + dispute.id, token('admin')); return request('/api/orders/disputes/' + dispute.id + '/decision', token('admin'), { version: current.version, decision: 'APPROVE_REFUND', reason: 'ชุดสาธิต: ตรวจเอกสารและประวัติคำชี้แจงแล้วอนุมัติคืนเงินตามข้อพิพาท', idempotencyKey: 'dataset-' + label + '-refund' }); });
          }
        }
        await step(key + '-safety-transcript-check', async () => { const history = await request('/api/orders/disputes/' + dispute.id + '/chat-history', token('trust')); assert.equal(history.conversation.id, room.id); return { conversationId: history.conversation.id, messages: history.items.length }; });
      }
    }
    const actual = await request('/api/orders/' + order.id, token('buyer'));
    createdOrders.push({ scenario: title, stage, orderId: order.id, productId: listing.id, checkoutId: checkout.id, conversationId: room.id, status: actual.status });
  }
  state.orderSummary = createdOrders;
  fs.writeFileSync(checkpoint, JSON.stringify(state, null, 2));
  console.log('Order/payment/shipping/dispute scenarios complete');
  const tickets = [];
  for (const stage of ['new', 'in-progress', 'waiting-customer', 'escalated', 'closed']) {
    const ticket = await step('ticket-' + stage, () => request('/api/support/tickets', token('buyer'), { subject: 'DEMO ช่วยติดตามการจัดส่ง · ' + stage, description: 'สอบถามขั้นตอนติดตามพัสดุและวิธีแจ้งปัญหาหลังรับสินค้า', category: 'ORDER', orderId: state['shipped-order'].id, targetId: accounts.seller.user.id }));
    const room = await step('ticket-' + stage + '-buyer-join', () => request('/api/support/tickets/' + ticket.id + '/join', token('buyer'), {}));
    await step('ticket-' + stage + '-question', () => request('/api/chat/conversations/' + room.conversationId + '/messages', token('buyer'), { body: 'พัสดุส่งแล้ว ช่วยแนะนำวิธีติดตามและขั้นตอนติดต่อผู้ขายด้วยครับ' }));
    if (stage !== 'new') {
      await step('ticket-' + stage + '-assign', async () => { const current = await request('/api/support/tickets/' + ticket.id, token('cs')); return request('/api/support/tickets/' + ticket.id + '/assign', token('cs'), { version: current.version }); });
      await step('ticket-' + stage + '-reply', () => request('/api/support/tickets/' + ticket.id + '/messages', token('cs'), { body: 'รับเรื่องแล้วครับ สามารถใช้เลขพัสดุที่หน้าคำสั่งซื้อเพื่อติดตามได้ หากได้รับสินค้าแล้วมีปัญหาให้แจ้งรายละเอียดเพิ่มเติม', eventKey: label + '-reply-' + stage }));
      await step('ticket-' + stage + '-internal-note', () => request('/api/support/tickets/' + ticket.id + '/messages', token('cs'), { body: 'ตรวจสอบ order และ shipping แล้ว เลขติดตามตรงกับข้อมูลผู้ขาย', isInternal: true, eventKey: label + '-note-' + stage }));
      for (const status of stage === 'waiting-customer' ? ['IN_PROGRESS', 'PENDING_USER'] : stage === 'escalated' ? ['IN_PROGRESS', 'ESCALATED'] : stage === 'closed' ? ['IN_PROGRESS', 'RESOLVED', 'CLOSED'] : ['IN_PROGRESS']) {
        await step('ticket-' + stage + '-' + status, async () => { const current = await request('/api/support/tickets/' + ticket.id, token('cs')); return request('/api/support/tickets/' + ticket.id + '/status', token('cs'), { status, version: current.version, reason: status === 'ESCALATED' ? 'ปัญหา: ลูกค้าได้รับคำขอให้ชำระนอกระบบ\nขาดอำนาจ: ต้องตรวจสอบความปลอดภัยของบัญชี\nข้อเสนอแนะ: ส่ง T&S ตรวจสอบ และ CS ติดต่อผู้ซื้อต่อ' : 'ดำเนินการตามขั้นตอนช่วยเหลือลูกค้า' }, 'PATCH'); });
      }
      if (stage === 'escalated') {
        await step('ticket-safety-takeover', async () => { const current = await request('/api/support/tickets/' + ticket.id, token('trust')); return request('/api/support/tickets/' + ticket.id + '/takeover', token('trust'), { version: current.version, reason: 'รับตรวจสอบ safety จากคำร้องของลูกค้า โดย CS เป็นผู้ติดต่อกลับ' }); });
        await step('ticket-cs-after-takeover', () => request('/api/support/tickets/' + ticket.id + '/messages', token('cs'), { body: 'ทีมความปลอดภัยรับตรวจสอบแล้ว ผมจะเป็นผู้แจ้งความคืบหน้าให้คุณครับ', eventKey: label + '-after-takeover' }));
        await step('ticket-oversight-read-only', () => request('/api/support/tickets/' + ticket.id + '/messages', token('trust'), { body: 'This attempted public reply must be rejected' }, 'POST', 403));
      }
    }
    const actual = await request('/api/support/tickets/' + ticket.id, token('buyer'));
    tickets.push({ stage, ticketId: ticket.id, status: actual.status, conversationId: room.conversationId });
  }
  state.ticketSummary = tickets;
  const reports = [];
  for (const stage of ['OPEN', 'REVIEWED', 'ACTIONED']) {
    const report = await step('report-' + stage, () => request('/api/auth/reports', token('buyer'), { targetId: accounts.seller.user.id, productId: state['cs-product'].id, reason: 'ชุดสาธิต: ขอให้ตรวจสอบการแจ้งสภาพสินค้าของผู้ขาย · ' + stage }));
    if (stage !== 'OPEN') await step('report-' + stage + '-review', () => request('/api/auth/admin/reports/' + report.id + '/review', token('trust'), {}));
    if (stage === 'ACTIONED') await step('report-' + stage + '-warn', () => request('/api/auth/admin/reports/' + report.id + '/action', token('trust'), { decision: 'WARN_USER', reason: 'ตรวจรายงานแล้ว ตักเตือนให้ผู้ขายระบุสภาพสินค้าและตำหนิให้ครบ', idempotencyKey: 'dataset-' + label + '-warning' }));
    reports.push({ reportId: report.id, status: stage });
  }
  state.reportSummary = reports;
  for (const [key, title, body] of [['payment', 'ชำระเงินและตรวจสอบคำสั่งซื้ออย่างไร', 'เลือกสินค้าลงตะกร้า เลือกที่อยู่จัดส่ง ตรวจยอดและส่วนลด แล้วชำระเงินจากหน้าคำสั่งซื้อ'], ['dispute', 'ได้รับสินค้าไม่ตรงรายละเอียดควรทำอย่างไร', 'ติดต่อผู้ขาย เก็บภาพสภาพสินค้า เปิดข้อพิพาทในคำสั่งซื้อ และส่งหลักฐานตามเวลาที่เจ้าหน้าที่กำหนด']]) {
    const article = await step('faq-' + key, () => request('/api/support/help', token('cs'), { title, body, category: key === 'payment' ? 'PAYMENT' : 'ORDER' }));
    await step('faq-' + key + '-publish', () => request('/api/support/help/' + article.id + '/publish', token('cs'), { version: article.version }, 'PATCH'));
  }
  const round = await step('auction-round', () => request('/api/products/auctions/rounds', token('marketing'), { title: 'DEMO รอบประมูลแจ็กเก็ตมือสอง', categories: ['เสื้อผ้า'], submissionStartsAt: new Date().toISOString(), submissionEndsAt: new Date(Date.now() + 2 * 86400000).toISOString(), auctionStartsAt: new Date(Date.now() + 3 * 86400000).toISOString(), auctionEndsAt: new Date(Date.now() + 4 * 86400000).toISOString() }));
  for (const key of ['pending', 'approved']) {
    const listing = await product('auction-' + key, 'DEMO แจ็กเก็ตสำหรับประมูล · ' + key);
    const auction = await step('auction-' + key, () => request('/api/products/auctions', token('seller'), { productId: listing.id, roundId: round.id, startingPrice: 450, bidIncrement: 50 }));
    if (key === 'approved') await step('auction-approved-action', () => request('/api/products/auctions/' + auction.id + '/approve', token('marketing'), {}, 'PATCH'));
  }
  const overview = await request('/api/auth/executive/reports?status=ALL', token('executive'));
  assert.ok((overview.data || overview).items.length >= 3, 'Executive complaints should see all report workflow stages');
  await request('/api/products/campaigns/' + campaign.id + '/metrics', token('marketing'));
  if (!state['demo-video-upload']) {
    const ffmpeg = path.resolve('tmp/local-dataset-tools/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe');
    if (!fs.existsSync(ffmpeg)) throw new Error('Install demo video tool: npm install --prefix tmp/local-dataset-tools @ffmpeg-installer/win32-x64 --no-audit --no-fund');
    const views = ['front', 'back', 'seam', 'label'];
    for (const view of views) await require('sharp')(path.join(imageDir, 'denim-' + view + '.svg')).png().toFile(path.join(output, 'demo-' + view + '.png'));
    fs.writeFileSync(path.join(output, 'demo-video-frames.txt'), views.map(view => "file 'demo-" + view + ".png'\nduration 1.5\n").join('') + "file 'demo-label.png'\n");
    const file = path.join(output, 'demo-denim.mp4');
    const result = require('node:child_process').spawnSync(ffmpeg, ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.resolve(output, 'demo-video-frames.txt').replaceAll('\\', '/'), '-vf', 'format=yuv420p', '-r', '24', '-c:v', 'libx264', '-movflags', '+faststart', file], { encoding: 'utf8', timeout: 60000 });
    if (result.status !== 0) throw new Error('Demo video rendering failed: ' + result.stderr);
    await step('demo-video-upload', () => { const form = new FormData(); form.append('video', new Blob([fs.readFileSync(file)], { type: 'video/mp4' }), 'demo-denim.mp4'); return request('/api/products/videos/upload', token('seller'), form); });
  }
  for (const key of ['one', 'two']) {
    const listing = await product('swipe-' + key, 'DEMO แจ็กเก็ตยีนส์สำหรับปัดเลือก · ' + key);
    await step('swipe-' + key + '-clip', () => request('/api/products/videos', token('seller'), { productId: listing.id, videoUrl: state['demo-video-upload'].media[0].url, description: 'ภาพประกอบสาธิตแจ็กเก็ตสี่มุมสำหรับชุดข้อมูล demo' }));
  }
  const clip = state['swipe-one-clip'];
  await step('swipe-buyer-interest', () => request('/api/products/videos/' + clip.id + '/choose', token('buyer'), {}));
  const otherSeller = await request('/api/auth/login', null, { email: 'shop.sneaker@example.com', password: 'password123' });
  await step('swipe-seller-interest', () => request('/api/products/videos/' + clip.id + '/choose', otherSeller.accessToken, {}));
  await step('swipe-staff-denied', () => request('/api/products/videos/' + clip.id + '/choose', token('cs'), {}, 'POST', 403));
  fs.writeFileSync(checkpoint, JSON.stringify(state, null, 2));
  console.log('Support, safety, reports, FAQ, auctions and executive scenarios complete');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
