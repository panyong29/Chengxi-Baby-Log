#!/bin/bash
# PocketBase collections 初始化脚本
# 用法：PB_URL=http://127.0.0.1:8090 ./init-collections.sh 'admin@pocketbase.local' '<密码>'
# 在 VPS 上执行。重复执行安全（已存在的 collection 会跳过）。
set -e
PB_URL="${PB_URL:-http://127.0.0.1:8090}"
ADMIN_EMAIL="$1"; ADMIN_PASS="$2"
[ -z "$ADMIN_EMAIL" ] && { echo "用法: $0 <admin邮箱> <admin密码>"; exit 1; }

TOKEN=$(curl -s "$PB_URL/api/collections/_superusers/auth-with-password" \
  -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
[ -z "$TOKEN" ] && { echo "管理员登录失败"; exit 1; }
AUTH=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')
exists() { curl -s "${AUTH[@]}" "$PB_URL/api/collections/$1" | grep -q '"name"'; }

mkcol() { # $1=name $2=json文件
  if exists "$1"; then echo "skip: $1 已存在"; else
    RESP=$(curl -s "${AUTH[@]}" -X POST "$PB_URL/api/collections" -d @"$2")
    echo "$RESP" | grep -q '"id"' && echo "ok: $1" || { echo "FAIL: $1"; echo "$RESP" | head -c 500; echo; exit 1; }
  fi
}

TMP=$(mktemp -d)

# ---- 1. family（先建，后面的表要引用它的 ID） ----
cat > $TMP/family.json <<'JSON'
{"name":"family","type":"base",
"fields":[
 {"name":"baby_nickname","type":"text","required":true},
 {"name":"baby_birthdate","type":"date"},
 {"name":"invite_code","type":"text","required":true},
 {"name":"members","type":"relation","collectionId":"_pb_users_auth_","maxSelect":20,"cascadeDelete":false},
 {"name":"created_by","type":"relation","collectionId":"_pb_users_auth_","maxSelect":1,"cascadeDelete":false}],
"indexes":["CREATE UNIQUE INDEX idx_family_code ON family (invite_code)"]}
JSON
mkcol family $TMP/family.json
FAMILY_ID=$(curl -s "${AUTH[@]}" "$PB_URL/api/collections/family" | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")
[ -z "$FAMILY_ID" ] && { echo "取 family ID 失败"; exit 1; }
echo "family id: $FAMILY_ID"

# 日志表规则（0.40 实测可用模式）：只允许操作自己家庭的记录
# family = 本记录的家庭，@request.auth.family = 登录用户归属的家庭
# 注意：family.members 这类 relation 链式写法在 0.40 运行时解析失败，改用用户归属比对
RULE_LIST="@request.auth.id != '' && @request.auth.family != '' && family = @request.auth.family"
# 日志表 update/delete：家庭成员可互改（妈妈改爸爸记错的条目是刚需）；
# 真正的安全边界是跨家庭隔离，成员身份校验已足够
RULE_MUT="$RULE_LIST"

cat > $TMP/feed_logs.json <<JSON
{"name":"feed_logs","type":"base",
"fields":[
 {"name":"family","type":"relation","collectionId":"$FAMILY_ID","required":true,"maxSelect":1,"cascadeDelete":true},
 {"name":"caregiver","type":"relation","collectionId":"_pb_users_auth_","maxSelect":1},
 {"name":"kind","type":"select","required":true,"values":["breast","bottle"]},
 {"name":"side","type":"select","values":["left","right"]},
 {"name":"duration_min","type":"number"},
 {"name":"amount_ml","type":"number"},
 {"name":"started_at","type":"date","required":true},
 {"name":"note","type":"text"},
 {"name":"is_backfill","type":"bool"},
 {"name":"deleted","type":"bool"},
 {"name":"client_id","type":"text"}],
"indexes":["CREATE INDEX idx_feed_fam_time ON feed_logs (family, started_at)"]}
JSON

cat > $TMP/diaper_logs.json <<JSON
{"name":"diaper_logs","type":"base",
"fields":[
 {"name":"family","type":"relation","collectionId":"$FAMILY_ID","required":true,"maxSelect":1,"cascadeDelete":true},
 {"name":"caregiver","type":"relation","collectionId":"_pb_users_auth_","maxSelect":1},
 {"name":"kind","type":"select","required":true,"values":["wet","dirty","mixed"]},
 {"name":"logged_at","type":"date","required":true},
 {"name":"note","type":"text"},
 {"name":"is_backfill","type":"bool"},
 {"name":"deleted","type":"bool"},
 {"name":"client_id","type":"text"}],
"indexes":["CREATE INDEX idx_diaper_fam_time ON diaper_logs (family, logged_at)"]}
JSON

cat > $TMP/sleep_logs.json <<JSON
{"name":"sleep_logs","type":"base",
"fields":[
 {"name":"family","type":"relation","collectionId":"$FAMILY_ID","required":true,"maxSelect":1,"cascadeDelete":true},
 {"name":"caregiver","type":"relation","collectionId":"_pb_users_auth_","maxSelect":1},
 {"name":"started_at","type":"date","required":true},
 {"name":"ended_at","type":"date"},
 {"name":"note","type":"text"},
 {"name":"is_backfill","type":"bool"},
 {"name":"deleted","type":"bool"},
 {"name":"client_id","type":"text"}],
"indexes":["CREATE INDEX idx_sleep_fam_time ON sleep_logs (family, started_at)"]}
JSON

mkcol feed_logs $TMP/feed_logs.json
mkcol diaper_logs $TMP/diaper_logs.json
mkcol sleep_logs $TMP/sleep_logs.json

cat > $TMP/weight_logs.json <<JSON
{"name":"weight_logs","type":"base",
"fields":[
 {"name":"family","type":"relation","collectionId":"$FAMILY_ID","required":true,"maxSelect":1,"cascadeDelete":true},
 {"name":"caregiver","type":"relation","collectionId":"_pb_users_auth_","maxSelect":1},
 {"name":"weight_kg","type":"number","required":true},
 {"name":"logged_at","type":"date","required":true},
 {"name":"note","type":"text"},
 {"name":"is_backfill","type":"bool"},
 {"name":"deleted","type":"bool"},
 {"name":"client_id","type":"text"}],
"indexes":["CREATE INDEX idx_weight_fam_time ON weight_logs (family, logged_at)"]}
JSON

cat > $TMP/event_logs.json <<JSON
{"name":"event_logs","type":"base",
"fields":[
 {"name":"family","type":"relation","collectionId":"$FAMILY_ID","required":true,"maxSelect":1,"cascadeDelete":true},
 {"name":"caregiver","type":"relation","collectionId":"_pb_users_auth_","maxSelect":1},
 {"name":"kind","type":"select","required":true,"values":["vaccine","medical","other"]},
 {"name":"title","type":"text","required":true},
 {"name":"logged_at","type":"date","required":true},
 {"name":"note","type":"text"},
 {"name":"is_backfill","type":"bool"},
 {"name":"deleted","type":"bool"},
 {"name":"client_id","type":"text"}],
"indexes":["CREATE INDEX idx_event_fam_time ON event_logs (family, logged_at)"]}
JSON
mkcol weight_logs $TMP/weight_logs.json
mkcol event_logs $TMP/event_logs.json

# ---- 2b. PATCH 补 API rules（创建时带 rule 会被静默丢弃，必须分两步） ----
setrule() { # $1=collection $2=json
  curl -s "${AUTH[@]}" -X PATCH "$PB_URL/api/collections/$1" -d "$2" | grep -q '"name"' && echo "rule ok: $1" || { echo "rule FAIL: $1"; exit 1; }
}
FAM_RULES='{"listRule":"@request.auth.id != \u0027\u0027 && @request.auth.family != \u0027\u0027 && id = @request.auth.family","viewRule":"@request.auth.id != \u0027\u0027 && @request.auth.family != \u0027\u0027 && id = @request.auth.family","createRule":null,"updateRule":"@request.auth.id != \u0027\u0027 && @request.auth.id = created_by"}'
setrule family "$FAM_RULES"
LOG_RULES="{\"listRule\":\"$RULE_LIST\",\"viewRule\":\"$RULE_LIST\",\"createRule\":\"$RULE_LIST\",\"updateRule\":\"$RULE_MUT\"}"
setrule feed_logs "$LOG_RULES"
setrule diaper_logs "$LOG_RULES"
setrule sleep_logs "$LOG_RULES"
setrule weight_logs "$LOG_RULES"
setrule event_logs "$LOG_RULES"

# ---- 2c. users 表规则显式声明（不依赖 PB 默认值） ----
# viewRule 放宽为"同家庭互可见"：否则 family expand members 会被过滤到只剩自己（2026-10-17 线上实证）
USERS_RULES='{"listRule":"id = @request.auth.id","viewRule":"@request.auth.id != \u0027\u0027 && @request.auth.family != \u0027\u0027 && family = @request.auth.family","createRule":"","updateRule":"id = @request.auth.id","deleteRule":"id = @request.auth.id"}'
setrule users "$USERS_RULES"

# ---- 3. users 表加扩展字段 ----
USERS=$(curl -s "${AUTH[@]}" "$PB_URL/api/collections/users")
echo "$USERS" | python3 -c "
import json,sys
c=json.load(sys.stdin)
names={f['name'] for f in c['fields']}
add=[]
if 'nickname' not in names: add.append({'name':'nickname','type':'text'})
if 'role' not in names: add.append({'name':'role','type':'select','values':['parent','caregiver']})
if 'family' not in names: add.append({'name':'family','type':'relation','collectionId':'$FAMILY_ID','maxSelect':1,'cascadeDelete':False})
c['fields'].extend(add)
open('/tmp/users_patch.json','w').write(json.dumps(c))
print('patch fields:', [f['name'] for f in add] or 'none needed')
"
curl -s "${AUTH[@]}" -X PATCH "$PB_URL/api/collections/users" -d @/tmp/users_patch.json | grep -q '"name":"users"' && echo "ok: users 扩展字段"

rm -rf $TMP /tmp/users_patch.json
echo "全部完成"
