"""Build the editable Order Service UML artifact from the current Prisma schema."""
from pathlib import Path
import re
import json
import xml.etree.ElementTree as E

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SCHEMA = ROOT / 'backend/services/order-service/prisma/schema.prisma'
models = {}
for name, body in re.findall(r'model (\w+)\s*\{(.*?)\n\}', SCHEMA.read_text(), re.S):
    fields = []
    for line in body.splitlines():
        m = re.match(r'\s*(\w+)\s+(\w+(?:\[\]|\?)?)(.*)', line)
        if m and m[2].rstrip('?[]') in {'String', 'Int', 'Decimal', 'DateTime', 'Boolean', 'Json', 'Float', 'BigInt', 'Bytes'}:
            tags = []
            if '@id' in m[3]: tags.append('id')
            if '@unique' in m[3]: tags.append('unique')
            if '@db.Decimal' in m[3]: tags.append('18,2')
            fields.append((m[1], m[2], ', '.join(tags)))
    models[name] = {'body': body, 'fields': fields}

# Every FK relation in this service, represented exactly once. Association ends
# describe schema-permitted states; business constraints are recorded in notes.
relations = []
for child, info in models.items():
    for line in info['body'].splitlines():
        m = re.match(r'\s*(\w+)\s+(\w+)(\?)?\s+@relation\(fields:\s*\[(\w+)\]', line)
        if not m: continue
        role, parent, nullable, fk = m.groups()
        fkline = next(x for x in info['body'].splitlines() if re.match(r'\s*'+fk+r'\s', x))
        unique = '@unique' in fkline or '@id' in fkline
        reverse = re.search(r'^\s*(\w+)\s+'+child+r'(?:\[\]|\?)\s*$', models[parent]['body'], re.M)
        relations.append({'parent':parent,'child':child,'parentMult':'0..1' if nullable else '1',
                          'childMult':'0..1' if unique else '0..*','parentRole':role,
                          'childRole':reverse[1] if reverse else child[0].lower()+child[1:], 'fk':fk,
                          'cascade':'onDelete: Cascade' in line})

COLORS = {'commerce':('#e8f1ff','#315e9b'), 'dispute':('#f3ecff','#7752a1'),
          'ops':('#e3f4ee','#32715a'), 'module':('#edf1f7','#52647d'), 'external':('#fff0da','#9a6b2b')}
def family(n):
    if n in {'AttributionJob','ProductSyncJob'}: return 'ops'
    if n.startswith(('Dispute','Safety')) or n=='Evidence': return 'dispute'
    return 'commerce'

# Logical OO responsibility allocation. These are design operations backed by
# existing procedural/module behavior, not claims about Prisma instance methods.
OPERATIONS = {
 'Basket': ['add(productId, buyerId)', 'remove(buyerId, basketId)', 'prepare(buyerId, basketIds)'],
 'Checkout': ['create(buyerId, orderIds, addressId)', 'confirm(buyerId, sessionId)', 'updateAddress(addressId)', 'expire(now)'],
 'Order': ['create(data)', 'updateStatus(status, expectedVersion)', 'updateCampaign(campaignId, finalPrice)', 'transitionStatusWithProductSync(options)'],
 'Payment': ['recordPaid(amount, paidAt)', 'recordSimulatedRefund(amount)'],
 'Shipping': ['updateAddress(addressId)', 'markShipped(company, trackingNumber)'],
 'Hold': ['addHold(source, referenceId, reason)', 'releaseHold(releasedBy)', 'hasActiveHolds()'],
 'OrderLog': ['append(actorId, action, detail)'],
 'DisputeCase': ['openDispute(reason, disputeType)', 'claim(userId, version)', 'reassign(toUserId, reason)', 'escalate(toUserId, reason)', 'decide(decision, reason, version)'],
 'DisputeCaseLog': ['append(actorId, action, detail)'],
 'DisputeEvidence': ['addEvidence(file, uploaderId)', 'setEvidenceDeadline(deadline)', 'requestMoreEvidence(reason)'],
 'Evidence': ['attach(refPath)', 'viewEvidence(actorId)'],
 'DisputeAuditLog': ['append(actorId, action, detail)'],
 'SafetyDisputeEvidence': ['verifyEvidence(status, detail, actorId)', 'getDisputeView(adminId)'],
 'SafetyLog': ['append(actorId, action, detail)'],
 'AttributionJob': ['processEvent()', 'deliver()', 'retryDelayMs(attempts)'],
 'CheckoutAddressSnapshot': ['saveAddress(address)', 'addressState()'],
 'ShippingAddressSnapshot': ['saveAddress(address)', 'addressState()'],
 'ProductSyncJob': ['createRequest(action, actorId)', 'processEvent()', 'findPendingForOrder(orderId)'],
}

OP_SOURCES = {
 'Basket':['features/cart/cartService.js'],
 'Checkout':['features/checkoutSessions/checkoutSessionService.js'],
 'Order':['models/orderModel.js'],
 'Payment':['features/checkoutSessions/checkoutSessionService.js: confirm / payment.create','models/orderModel.js: transitionStatusWithProductSync / payment.create'],
 'Shipping':['features/shipping/shippingService.js'],
 'Hold':['services/orderTransitionService.js'],
 'OrderLog':['models/orderModel.js: orderLog.create'],
 'DisputeCase':['features/disputes/disputeModel.js'],
 'DisputeCaseLog':['features/disputes/disputeModel.js: disputeCaseLog.create'],
 'DisputeEvidence':['features/disputes/disputeModel.js: addEvidence, setEvidenceDeadline, requestMoreEvidence'],
 'Evidence':['features/disputes/disputeModel.js: addEvidence / nested files.create','features/disputes/disputeService.js: viewEvidence'],
 'DisputeAuditLog':['features/disputes/disputeModel.js: disputeAuditLog.create'],
 'SafetyDisputeEvidence':['features/adminDisputes/adminDisputeService.js'],
 'SafetyLog':['features/adminDisputes/adminDisputeService.js: safetyLog.create'],
 'AttributionJob':['services/attributionOutboxService.js'],
 'CheckoutAddressSnapshot':['models/orderHistoryClient.js: saveAddress, addressState (model=checkout)'],
 'ShippingAddressSnapshot':['models/orderHistoryClient.js: saveAddress, addressState (model=shipping)'],
 'ProductSyncJob':['services/productSyncService.js'],
}

mxfile=E.Element('mxfile',host='app.diagrams.net',version='32.5.4',type='device')
pages=[]
class Page:
    def __init__(self,pid,name,title,subtitle,width,height):
        self.pid=pid; self.nodes={}; self.count=0; self.edges=[]
        d=E.SubElement(mxfile,'diagram',id=pid,name=name)
        self.model=E.SubElement(d,'mxGraphModel',dx='1400',dy='900',grid='1',gridSize='10',guides='1',tooltips='1',connect='1',arrows='1',fold='1',page='1',pageScale='1',pageWidth=str(width),pageHeight=str(height),math='0',shadow='0',background='#ffffff')
        self.root=E.SubElement(self.model,'root'); E.SubElement(self.root,'mxCell',id='0'); E.SubElement(self.root,'mxCell',id='1',parent='0')
        self.text('title',title,60,35,width-120,50,30,'#172d49',True)
        self.text('subtitle',subtitle,60,95,width-120,65,16,'#52647d')
        pages.append(self)
    def text(self,id,value,x,y,w,h,size=14,color='#334155',bold=False,parent='1',extra=''):
        c=E.SubElement(self.root,'mxCell',id=id,value=value,vertex='1',parent=parent,
          style=f'text;html=0;whiteSpace=wrap;align=left;verticalAlign=top;spacing=0;fontFamily=Helvetica;fontSize={size};fontColor={color};fontStyle={1 if bold else 0};{extra}')
        E.SubElement(c,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),**{'as':'geometry'})
        return c
    def box(self,n,x,y,w=330,full=False,selected=None,fields=None,kind=None,subtitle=None,operations=None):
        if fields is None:
            fields=models[n]['fields']
            if not full:
                sel=selected or [a[0] for a in fields[:5]]
                fields=[a for a in fields if a[0] in sel]
            lines=[f'{a}: {b}'+(f' {{{c}}}' if c else '') for a,b,c in fields]
        else: lines=fields
        ops=OPERATIONS.get(n, []) if operations is None else operations
        attributes_h=len(lines)*23+22
        methods_h=len(ops)*23+22 if ops else 0
        h=64+attributes_h+methods_h
        fill,stroke=COLORS[kind or family(n)]
        stereo=subtitle or ('logical class' if n in models else 'module')
        c=E.SubElement(self.root,'mxCell',id=n,value=f'«{stereo}»\n{n}',vertex='1',parent='1',
          style=f'swimlane;html=0;startSize=58;horizontal=1;rounded=0;collapsible=0;whiteSpace=wrap;align=center;verticalAlign=middle;fontFamily=Helvetica;fontSize=17;fontStyle=1;fillColor={fill};swimlaneFillColor=#ffffff;strokeColor={stroke};fontColor=#172d49;strokeWidth=1.5;')
        E.SubElement(c,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),**{'as':'geometry'})
        self.text(n+'_fields','\n'.join(lines),12,70,w-24,attributes_h-12,14,parent=n)
        if ops:
            sep=E.SubElement(self.root,'mxCell',id=n+'_separator',vertex='1',parent=n,
                style=f'line;strokeColor={stroke};strokeWidth=1;')
            E.SubElement(sep,'mxGeometry',x='0',y=str(64+attributes_h),width=str(w),height='1',**{'as':'geometry'})
            self.text(n+'_operations','\n'.join('+ '+op for op in ops),12,74+attributes_h,w-24,methods_h-12,14,parent=n)
        self.nodes[n]=(x,y,w,h)
        return h
    def edge(self,s,t,sm='',tm='',sr='',tr='',points=None,exit=(1,.5),entry=(0,.5),dep=False):
        self.count+=1; eid=f'e{self.count}'
        style=f'edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;orthogonalLoop=1;jettySize=30;endArrow={"open" if dep else "none"};endFill=0;startArrow=none;strokeWidth=1.5;strokeColor={"#64748b" if dep else "#475569"};fontFamily=Helvetica;fontSize=13;labelBackgroundColor=#ffffff;exitX={exit[0]};exitY={exit[1]};entryX={entry[0]};entryY={entry[1]};exitPerimeter=1;entryPerimeter=1;'+('dashed=1;dashPattern=8 5;' if dep else '')
        c=E.SubElement(self.root,'mxCell',id=eid,edge='1',parent='1',source=s,target=t,style=style)
        geo=E.SubElement(c,'mxGeometry',relative='1',**{'as':'geometry'})
        if points:
            arr=E.SubElement(geo,'Array',**{'as':'points'})
            for x,y in points:E.SubElement(arr,'mxPoint',x=str(x),y=str(y))
        # End labels stay on the edge so they move when classes are rearranged.
        for suffix,value,pos,anchor in [('s',sm,-1,exit),('t',tm,1,entry)]:
            if not value.strip():continue
            l=E.SubElement(self.root,'mxCell',id=eid+suffix,value=value.strip(),vertex='1',connectable='0',parent=eid,
                style='edgeLabel;html=0;align=center;verticalAlign=middle;resizable=0;points=[];fontSize=13;fontFamily=Helvetica;labelBackgroundColor=#ffffff;fontColor=#334155;')
            g=E.SubElement(l,'mxGeometry',x=str(pos),y='0',relative='1',**{'as':'geometry'})
            dx,dy = (-24,-15) if anchor[0]==0 else ((24,-15) if anchor[0]==1 else ((-18,-22) if anchor[1]==0 else (-18,22)))
            E.SubElement(g,'mxPoint',x=str(dx),y=str(dy),**{'as':'offset'})
        self.edges.append((s,t,dep))
    def relation(self,r,**opts):
        self.edge(r['parent'],r['child'],r['parentMult'],r['childMult'],r['parentRole'],r['childRole'],**opts)

def note(p,y,width=1800):
    p.text('legend','UML KEY   ━  Association; navigability unspecified     •     0..1 optional     •     0..* zero or more     •     ? nullable     •     {id} identifier     •     {unique} unique value',60,y,width,35,15,'#172d49',True)
    p.text('notes','Logical OO design: each class combines schema attributes and operations allocated by responsibility from existing module behavior.\nOperations are design mappings, not literal Prisma instance methods; signatures are condensed. Page 04 preserves selected actual module functions.\nMultiplicity follows the current schema. Checkout creation requires 1–20 orders. External user/product/address IDs are scalar references.\nSource: backend/services/order-service/prisma/schema.prisma + src/. Operation mapping: operations.json. Notation: OMG UML 2.5.1.',60,y+48,width,110,15)

p=Page('01','01 · Domain overview','ORDER SERVICE / CLASS DIAGRAM','01  Logical OO classes · attributes + operations in every class · 18 classes / 18 associations\nThree compartments: class name / attributes / functions. Pages 02–03 expand attributes; page 04 shows the source modules.',1980,2470)
pos={'CheckoutAddressSnapshot':(60,220),'Checkout':(550,220),'Shipping':(1090,220),'ShippingAddressSnapshot':(1570,220),
 'Basket':(60,650),'Order':(550,650),'Payment':(1090,650),'Hold':(1570,650),
 'OrderLog':(60,1070),'AttributionJob':(550,1070),'ProductSyncJob':(1090,1070),
 'DisputeCaseLog':(60,1490),'DisputeCase':(550,1490),'DisputeEvidence':(1090,1490),'Evidence':(1570,1490),
 'SafetyLog':(60,1910),'SafetyDisputeEvidence':(550,1910),'DisputeAuditLog':(1090,1910)}
selected={'Order':['id','checkoutId','basketId','status','ordersAmount','version'], 'DisputeCase':['id','orderId','status','decision','assignedTo','version'],
 'DisputeEvidence':['id','disputeCaseId','uploaderId','status','version'], 'SafetyDisputeEvidence':['id','orderId','evidenceId','status','verifyBy'],
 'Payment':['id','orderId','paymentType','paymentStatus','paymentAmount'], 'Checkout':['id','buyerId','status','cancelAt','paidAt'],
 'Hold':['id','paymentId','source','referenceId','holdStatus'], 'Shipping':['id','orderId','addressId','status','trackingNumber']}
for n,(x,y) in pos.items():p.box(n,x,y,350,selected=selected.get(n))
# Explicit lanes prevent the long Order associations from running through classes.
routes={
 ('Checkout','Order'):dict(exit=(.5,1),entry=(.5,0)),
 ('Basket','Order'):dict(),('Order','Payment'):dict(),('Payment','Hold'):dict(),
 ('Checkout','CheckoutAddressSnapshot'):dict(exit=(0,.5),entry=(1,.5)),
 ('Order','Shipping'):dict(exit=(.8,0),entry=(.5,1),points=[(830,560),(1265,560)]),
 ('Shipping','ShippingAddressSnapshot'):dict(),
 ('Order','OrderLog'):dict(exit=(0,.8),entry=(1,.5),points=[(480,863),(480,1200)]),
 ('Order','AttributionJob'):dict(exit=(.5,1),entry=(.5,0)),
 ('Order','ProductSyncJob'):dict(exit=(1,.8),entry=(.5,0),points=[(990,863),(990,1010),(1265,1010)]),
 ('Order','DisputeCase'):dict(exit=(.2,1),entry=(.2,0),points=[(620,980),(440,980),(440,1410),(620,1410)]),
 ('DisputeCase','DisputeCaseLog'):dict(exit=(0,.5),entry=(1,.5)),
 ('DisputeCase','DisputeEvidence'):dict(),('DisputeEvidence','Evidence'):dict(),
 ('DisputeEvidence','DisputeAuditLog'):dict(exit=(.5,1),entry=(.5,0)),
 ('Order','SafetyDisputeEvidence'):dict(exit=(1,.4),entry=(.9,0),points=[(960,750),(960,1878),(865,1878)]),
 ('DisputeEvidence','SafetyDisputeEvidence'):dict(exit=(.2,1),entry=(1,.5),points=[(1160,1810),(1010,1810),(1010,2025)]),
 ('SafetyDisputeEvidence','SafetyLog'):dict(exit=(0,.5),entry=(1,.5))}
for r in relations:p.relation(r,**routes[(r['parent'],r['child'])])
note(p,2300,1860)

p=Page('02','02 · Commerce details','ORDER SERVICE / COMMERCE','02  Complete scalar attributes + allocated operations · checkout, order, payment, shipping and durable jobs\nLogical OO design mapped to the existing schema and module behavior; see operations.json for implementation sources.',2440,2700)
pos2={'Checkout':(60,220),'CheckoutAddressSnapshot':(60,800),'Basket':(60,1320),'Order':(660,590),
 'Shipping':(1260,220),'ShippingAddressSnapshot':(1860,220),'Payment':(1260,800),'Hold':(1860,800),
 'OrderLog':(60,1850),'AttributionJob':(660,1850),'ProductSyncJob':(1260,1850)}
for n,(x,y) in pos2.items():p.box(n,x,y,440,full=True)
for r in relations:
    a,b=r['parent'],r['child']
    if a not in pos2 or b not in pos2:continue
    opts={}
    if (a,b)==('Checkout','CheckoutAddressSnapshot'):opts=dict(exit=(.5,1),entry=(.5,0))
    elif (a,b)==('Checkout','Order'):opts=dict(exit=(1,.5),entry=(.25,0),points=[(580,400),(580,540),(770,540)])
    elif (a,b)==('Basket','Order'):opts=dict(exit=(1,.5),entry=(0,.85))
    elif (a,b)==('Order','Shipping'):opts=dict(exit=(.8,0),entry=(.5,1),points=[(1012,540),(1480,540)])
    elif a=='Order' and b in {'OrderLog','AttributionJob','ProductSyncJob'}:
        index=['OrderLog','AttributionJob','ProductSyncJob'].index(b)
        opts=dict(exit=(.2+.3*index,1),entry=(.5,0),points=[(748+132*index,1730),(pos2[b][0]+220,1730)])
    p.relation(r,**opts)
note(p,2500,2320)

p=Page('03','03 · Dispute details','ORDER SERVICE / DISPUTES & EVIDENCE','03  Complete scalar attributes + allocated operations · case ownership, evidence and safety review\nLogical OO design: case and evidence behavior is allocated from the existing dispute modules.',2420,2250)
pos3={'Order':(60,220),'DisputeCase':(650,220),'DisputeCaseLog':(1240,220),'DisputeEvidence':(1240,850),
 'Evidence':(1830,850),'DisputeAuditLog':(1830,1350),'SafetyDisputeEvidence':(650,1450),'SafetyLog':(60,1450)}
for n,(x,y) in pos3.items():p.box(n,x,y,440,full=True)
for r in relations:
    a,b=r['parent'],r['child']
    if a not in pos3 or b not in pos3:continue
    opts={}
    if (a,b)==('DisputeCase','DisputeEvidence'):opts=dict(exit=(1,.8),entry=(0,.3))
    elif (a,b)==('Order','SafetyDisputeEvidence'):opts=dict(exit=(.5,1),entry=(.15,0),points=[(280,1290),(716,1290)])
    elif (a,b)==('DisputeEvidence','DisputeAuditLog'):opts=dict(exit=(.75,1),entry=(0,.5),points=[(1570,1490)])
    elif (a,b)==('DisputeEvidence','SafetyDisputeEvidence'):opts=dict(exit=(0,.7),entry=(.8,0),points=[(1160,1160),(1160,1370),(1002,1370)])
    elif (a,b)==('SafetyDisputeEvidence','SafetyLog'):opts=dict(exit=(0,.5),entry=(1,.5))
    p.relation(r,**opts)
note(p,1960,2300)

p=Page('04','04 · Application operations','ORDER SERVICE / APPLICATION OPERATIONS','04  Module attributes/dependencies + selected real functions in three compartments\nThese are JavaScript modules/factory objects. Dashed open arrows point from caller to supplier; / marks a derived configuration value.',2420,2040)
spec={
 'orderController':('controllers/orderController.js',['create(req, res, next)','mine(req, res, next)','selling(req, res, next)','getOne(req, res, next)','updateStatus(req, res, next)','pay(req, res, next)']),
 'checkoutSessionService':('features/checkoutSessions/checkoutSessionService.js',['create(options)','get(options)','confirm(options)','updateAddress(options)','expireDue(options)','startExpiryWorker()']),
 'checkoutService':('features/checkout/checkoutService.js',['reserveOrder(options, dependencies)']),
 'orderModel':('models/orderModel.js',['create(data)','findById(id)','findByReservationId(basketId)','listByBuyer(buyerId, options)','listBySeller(sellerId, options)','transitionStatusWithProductSync(options)']),
 'productSyncService':('services/productSyncService.js',['createRequest(db, order, actorId, data)','processEvent(eventId, options)','processPendingEvents(options)','findPendingForOrder(orderId, db)','startWorker()']),
 'productClient':('services/productClient.js',['reserveProduct(productId, buyerId)','releaseProductReservation(...)','completeProductReservation(...)','quoteAndHold(...)','recordOrderCompleted(...)']),
 'disputeController':('features/disputes/disputeController.js',['open(req, res, next)','getOne(req, res, next)','queue(req, res, next)']),
 'disputeService':('features/disputes/disputeService.js',['open(options)','getById(options)','addEvidence(options)','claim(options)','reassign(options)','escalate(options)','decide(options)','getChatHistory(options)']),
 'disputeModel':('features/disputes/disputeModel.js',['findById(id)','findByOrderId(orderId)','openDispute(options)','addEvidence(options)','claim(options)','decide(options)']),
 'orderTransitionService':('services/orderTransitionService.js',['addHold(tx, options)','releaseHold(tx, options)','hasActiveHolds(tx, orderId)','resolveHoldState(tx, orderId)','assertCanCancelOrder(order)']),
 'chatClient':('services/chatClient.js',['notifyOrderPlaced(order)','notifyOrderPaid(order)','notifyOrderStatusChanged(order, status)','joinDisputeConversation(...)','getDisputeTranscript(...)']),
 'authClient':('services/authClient.js',['getUser(...)','searchStaff(query)']),
}
pos4={'orderController':(60,230),'checkoutSessionService':(650,230),'checkoutService':(1240,230),'productClient':(1830,230),
 'orderModel':(60,800),'productSyncService':(650,800),'orderTransitionService':(1240,800),'authClient':(1830,800),
 'disputeController':(60,1370),'disputeService':(650,1370),'disputeModel':(1240,1370),'chatClient':(1830,1370)}
MODULE_ATTRIBUTES={
 'orderController':['orderModel: Object {readOnly}','productClient: Object {readOnly}'],
 'checkoutSessionService':['PAYMENT_TTL_MS: Number {readOnly}','INCLUDE: Object {readOnly}'],
 'checkoutService':['defaultOrderModel: Object {readOnly}','defaultProductClient: Object {readOnly}'],
 'orderModel':['prisma: PrismaClient {readOnly}','VALID_STATUSES: String[] {readOnly}','INCLUDE: Object {readOnly}'],
 'productSyncService':['prisma: PrismaClient {readOnly}','ACTIONS: Object {readOnly}'],
 'productClient':['/serviceUrl: String {derived}','/internalToken: String {derived}'],
 'disputeController':['disputeService: Object {readOnly}','upload: Object {readOnly}'],
 'disputeService':['orderModel: Object {readOnly}','disputeModel: Object {readOnly}'],
 'disputeModel':['prisma: PrismaClient {readOnly}','transitions: Object {readOnly}'],
 'orderTransitionService':['badRequest: Function {readOnly}','conflict: Function {readOnly}'],
 'chatClient':['CHAT_SERVICE_URL: String {readOnly}','INTERNAL_TOKEN: String {readOnly}'],
 'authClient':['AUTH_SERVICE_URL: String {readOnly}','REQUEST_TIMEOUT_MS: Number {readOnly}'],
}
for n,(path,ops) in spec.items():
    p.box(n,*pos4[n],440,fields=MODULE_ATTRIBUTES[n],operations=ops,kind='external' if n.endswith('Client') else 'module',subtitle='module')
    p.text(n+'_source',path,pos4[n][0],pos4[n][1]-44,440,36,12,'#64748b')
# Keep this a deliberately selected call view, with every arrow grounded in a
# require/import in the caller; omitted dependencies are explicitly disclosed.
deps=[('orderController','checkoutService'),('orderController','orderModel'),
 ('checkoutSessionService','orderModel'),('checkoutSessionService','productSyncService'),
 ('checkoutService','productClient'),('checkoutService','orderModel'),
 ('orderModel','orderTransitionService'),('productSyncService','productClient'),
 ('disputeController','disputeService'),('disputeService','disputeModel'),
 ('disputeService','authClient'),('disputeService','chatClient'),('disputeModel','orderTransitionService')]
for i,(a,b) in enumerate(deps):
    opts={}
    if (a,b)==('orderController','checkoutService'):opts=dict(exit=(.5,0),entry=(.5,0),points=[(280,180),(1460,180)])
    elif (a,b)==('checkoutService','orderModel'):opts=dict(exit=(.5,1),entry=(1,.2),points=[(1460,660),(560,660),(560,868)])
    elif (a,b)==('orderModel','orderTransitionService'):opts=dict(exit=(.5,0),entry=(.5,0),points=[(280,720),(1460,720)])
    elif (a,b)==('productSyncService','productClient'):opts=dict(exit=(.9,0),entry=(.5,1),points=[(1046,620),(2050,620)])
    elif (a,b)==('disputeService','authClient'):opts=dict(exit=(.9,0),entry=(.5,1),points=[(1046,1270),(2050,1270)])
    elif (a,b)==('disputeService','chatClient'):opts=dict(exit=(.5,1),entry=(.5,1),points=[(870,1770),(2050,1770)])
    elif pos4[a][0]==pos4[b][0]:opts=dict(exit=(.5,1),entry=(.5,0))
    elif pos4[a][1]!=pos4[b][1]:opts=dict(exit=(.5,1) if pos4[b][1]>pos4[a][1] else (.5,0),entry=(.5,0) if pos4[b][1]>pos4[a][1] else (.5,1))
    p.edge(a,b,dep=True,**opts)
p.text('legend','UML KEY   - - - >  Dependency: caller → supplier     •     + exported/public operation     •     (...) parameters suppressed for long signatures',60,1830,2300,40,16,'#172d49',True)
p.text('notes','Selected call view; not an exhaustive dependency graph. Source paths are relative to backend/services/order-service/src/.\nAttributes show module bindings/configuration; /serviceUrl and /internalToken are derived from productClient getter functions. Pages 01–03 show logical domain classes.',60,1880,2300,60,15)

# Validate artifact structure before writing it.
assert len(models)==18
assert len(relations)==18, len(relations)
assert set(pos)==set(models)
assert set(OPERATIONS)==set(models)
assert all(OPERATIONS.values())
for pg in pages:
    ids=[c.get('id') for c in pg.root.findall('mxCell')]
    assert len(ids)==len(set(ids)),pg.pid
    assert all(n+'_fields' in ids and n+'_operations' in ids for n in pg.nodes), (pg.pid,'missing class compartment')
    for a,b,_ in pg.edges:assert a in pg.nodes and b in pg.nodes,(pg.pid,a,b)
    nodes=list(pg.nodes.items())
    for i,(a,(ax,ay,aw,ah)) in enumerate(nodes):
        for b,(bx,by,bw,bh) in nodes[i+1:]:
            assert not (ax<bx+bw and bx<ax+aw and ay<by+bh and by<ay+ah),(pg.pid,a,b,'overlap')
# Monochrome presentation requested by the user: transparent compartments and
# black outlines, separators, connectors, arrowheads, and text on every page.
for cell in mxfile.iter('mxCell'):
    if not cell.get('style'):
        continue
    named_styles = [item for item in cell.get('style').split(';') if item and '=' not in item]
    style = dict(item.split('=', 1) for item in cell.get('style').split(';') if '=' in item)
    if 'strokeColor' in style:
        style['strokeColor'] = '#000000'
    if 'fontColor' in style:
        style['fontColor'] = '#000000'
    if 'swimlane' in cell.get('style'):
        style['fillColor'] = 'none'
        style['swimlaneFillColor'] = 'none'
        style['gradientColor'] = 'none'
    if 'labelBackgroundColor' in style:
        style['labelBackgroundColor'] = 'none'
    cell.set('style', ';'.join(named_styles+[key+'='+value for key,value in style.items()])+';')
E.indent(mxfile)
E.ElementTree(mxfile).write(HERE/'OrderServiceClassDiagram.drawio',encoding='utf-8',xml_declaration=True)
(HERE/'relations.json').write_text(json.dumps(relations,indent=2),encoding='utf-8')
(HERE/'operations.json').write_text(json.dumps({n:{'operations':OPERATIONS[n],'sources':OP_SOURCES[n]} for n in models},indent=2),encoding='utf-8')
print(json.dumps({'models':len(models),'relations':len(relations),'pages':[{'id':pg.pid,'classes':len(pg.nodes),'edges':len(pg.edges)} for pg in pages]}))
