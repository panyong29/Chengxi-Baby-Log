// S8：记录创建按 client_id 幂等（超时重试不再产生重复记录）
// 实测：onRecordCreateRequest 的 collection tag 参数在 PB 0.40.5 上不生效，
// 故用无 tag 全局 hook，在内部按集合名判断。
onRecordCreateRequest((e) => {
  const n = e.collection.name;
  const wanted = n === 'feed_logs' || n === 'diaper_logs' || n === 'sleep_logs' || n === 'weight_logs' || n === 'event_logs';
  if (!wanted) { e.next(); return; }
  let clientId = '';
  try { clientId = e.record.get('client_id') || ''; } catch (err) { clientId = ''; }
  if (clientId) {
    let existing = null;
    try { existing = $app.findFirstRecordByData(e.collection, 'client_id', clientId); } catch (err) { existing = null; }
    if (existing) { e.json(200, existing); return; }
  }
  e.next();
});
