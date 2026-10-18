// PocketBase pb_hooks：邀请码加入家庭（PocketBase 0.40.x API）
// 挂载：容器 -v /home/muse/pocketbase/pb_hooks:/pb_hooks
// 调用：POST /api/join-family  { invite_code, nickname, email, password }
// 返回：{ ok: true, family } → 客户端随后 authWithPassword 拿 token
// 全程用户无密码概念，密码由客户端生成、存 SecureStore
routerAdd("POST", "/api/join-family", (e) => {
  const body = e.requestInfo().body || {};
  const code = (body.invite_code || "").trim().toUpperCase();
  const nickname = (body.nickname || "成员").trim().slice(0, 20);
  const email = body.email;
  const password = body.password;

  if (!code || !email || !password) {
    return e.json(400, { message: "缺少 invite_code / email / password" });
  }

  let family = null;
  try {
    family = $app.findFirstRecordByFilter("family", "invite_code = {:code}", { code: code });
  } catch (err) {
    return e.json(404, { message: "邀请码无效" });
  }
  if (!family) return e.json(404, { message: "邀请码无效" });

  try {
    $app.findFirstRecordByFilter("users", "email = {:email}", { email: email });
    return e.json(409, { message: "该设备已加入过" });
  } catch (err) { /* 没找到就是好的，继续 */ }

  const usersCol = $app.findCollectionByNameOrId("users");
  const user = new Record(usersCol);
  user.setEmail(email);
  user.setPassword(password);
  user.set("nickname", nickname);
  user.set("role", "caregiver");
  user.set("family", family.id);
  user.setVerified(true);
  $app.save(user);

  const members = family.get("members") || [];
  members.push(user.id);
  family.set("members", members);
  $app.save(family);

  return e.json(200, { ok: true, family: family.id });
});

// 建家庭（爸爸注册后调用）：创建 family + 生成邀请码 + 把自己设为管理员
// 调用：POST /api/create-family（需登录） { baby_nickname, baby_birthdate }
// 返回：{ ok: true, family, invite_code }
routerAdd("POST", "/api/create-family", (e) => {
  const info = e.requestInfo();
  const auth = info.auth; // 登录用户记录
  if (!auth) return e.json(401, { message: "请先登录" });
  if (auth.get("family")) return e.json(409, { message: "已有所属家庭" });

  const body = info.body || {};
  const babyNickname = (body.baby_nickname || "宝宝").trim().slice(0, 20);

  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code = babyNickname.slice(0, 1) + " " + code;

  const famCol = $app.findCollectionByNameOrId("family");
  const family = new Record(famCol);
  family.set("baby_nickname", babyNickname);
  family.set("baby_birthdate", body.baby_birthdate || "");
  family.set("invite_code", code);
  family.set("members", [auth.id]);
  family.set("created_by", auth.id);
  $app.save(family);

  auth.set("nickname", (body.nickname || "爸爸").trim().slice(0, 20));
  auth.set("role", "parent");
  auth.set("family", family.id);
  $app.save(auth);

  return e.json(200, { ok: true, family: family.id, invite_code: code });
});
