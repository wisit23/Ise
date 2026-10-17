const authService = require("../../services/authService");

async function displayNames(req, res, next) {
  try {
    const result = await authService.getDisplayNames(req.body?.userIds);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function eligibleStaff(req, res, next) {
  try {
    const { parsePagination, paginatedResponse, badRequest } = require('@reloop/shared');
    const prisma = require('../../models/prismaClient');
    const allowed = ['CUSTOMER_SERVICE','TRUST_AND_SAFETY','ADMIN'];
    const roles = req.body?.roles;
    if (!Array.isArray(roles) || !roles.length || roles.some(role => !allowed.includes(role))) throw badRequest('invalid staff roles');
    const pagination = parsePagination(req.body,20);
    const q = typeof req.body.q === 'string' ? req.body.q.trim().slice(0,100) : '';
    const where = { status:'ACTIVE', AND:[{ OR:[{ roles:{none:{}},role:{in:roles} },{ roles:{some:{role:{in:roles}}} }] }] };
    if(q) where.AND.push({OR:[{firstName:{contains:q,mode:'insensitive'}},{id:{contains:q,mode:'insensitive'}}]});
    const [rows,total] = await Promise.all([prisma.user.findMany({where,skip:pagination.skip,take:pagination.take,orderBy:[{firstName:'asc'},{id:'asc'}],select:{id:true,firstName:true,role:true,roles:{select:{role:true}}}}),prisma.user.count({where})]);
    res.json(paginatedResponse(rows.map(row=>({id:row.id,displayName:row.firstName,roles:[...new Set(row.roles.length ? row.roles.map(item=>item.role) : [row.role])].filter(role=>allowed.includes(role))})),total,pagination));
  } catch(err) { next(err); }
}
async function searchUsers(req, res, next) {
  try {
    const q = typeof req.body?.q === "string" ? req.body.q.trim().slice(0, 100) : "";
    if (!q) {
      return res.json([]);
    }
    const prisma = require("../../models/prismaClient");

    const orConditions = [
      { id: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { sellerProfile: { shopName: { contains: q, mode: "insensitive" } } },
    ];

    const parts = q.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      orConditions.push({
        AND: parts.map((part) => ({
          OR: [
            { firstName: { contains: part, mode: "insensitive" } },
            { lastName: { contains: part, mode: "insensitive" } },
            { sellerProfile: { shopName: { contains: part, mode: "insensitive" } } },
          ],
        })),
      });
    }

    const users = await prisma.user.findMany({
      where: { OR: orConditions },
      take: 100,
      select: {
        id: true,
        firstName: true,
        sellerProfile: { select: { shopName: true } },
      },
    });

    res.json(
      users.map((u) => ({
        id: u.id,
        userId: u.id,
        displayName: u.sellerProfile?.shopName || u.firstName,
      })),
    );
  } catch (err) {
    next(err);
  }
}

module.exports = { displayNames, eligibleStaff, searchUsers };
