/*
 * Cloudflare 优选 IP - Stash 终极显示版
 * 功能：
 * 1. 同时显示 移动/电信/联通/IPv6
 * 2. 紧凑格式：显示 IP + 延迟 + 带宽
 * 3. 结果写入日志，支持长按复制
 * 4. 动态背景颜色
 */

// ================= 1. MD5 核心算法 (请勿修改) =================
function md5cycle(x, k) {
  let a = x[0], b = x[1], c = x[2], d = x[3];
  function cmn(q, a, b, x, s, t) { a = (a + q + x + t) | 0; return (((a << s) | (a >>> (32 - s))) + b) | 0; }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
  a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586); c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
  a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426); c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
  a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417); c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
  a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101); c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
  a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632); c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
  a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083); c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
  a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690); c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
  a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784); c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
  a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463); c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
  a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353); c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
  a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222); c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
  a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835); c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
  a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415); c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
  a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606); c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
  a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744); c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
  a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379); c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
  x[0] = (a + x[0]) | 0; x[1] = (b + x[1]) | 0; x[2] = (c + x[2]) | 0; x[3] = (d + x[3]) | 0;
}
function md5blk(s) { const md5blks = []; for (let i = 0; i < 64; i += 4) { md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24); } return md5blks; }
function md51(s) { const n = s.length; const state = [1732584193, -271733879, -1732584194, 271733878]; let i; for (i = 64; i <= n; i += 64) { md5cycle(state, md5blk(s.substring(i - 64, i))); } s = s.substring(i - 64); const tail = new Array(16).fill(0); for (i = 0; i < s.length; i++) { tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3); } tail[i >> 2] |= 0x80 << ((i % 4) << 3); if (i > 55) { md5cycle(state, tail); for (i = 0; i < 16; i++) tail[i] = 0; } tail[14] = n * 8; md5cycle(state, tail); return state; }
function rhex(n) { const s = "0123456789abcdef"; let j, str = ""; for (j = 0; j < 4; j++) { str += s.charAt((n >> (j * 8 + 4)) & 0x0F) + s.charAt((n >> (j * 8)) & 0x0F); } return str; }
function hex(x) { return x.map(rhex).join(""); }
function md5(s) { return hex(md51(s)); }

// ================= 2. 核心优选逻辑 =================
const time = Date.now().toString();
const key = md5(md5("DdlTxtN0sUOu") + "70cloudflareapikey" + time);
const realUrl = `https://api.uouin.com/index.php/index/Cloudflare?key=${key}&time=${time}`;

function getBestIP(list) {
    if(!list) return null;
    let v = list.filter(i => i.loss === "0.00%");
    if(v.length===0) return list[0];
    // 按评分排序 (延迟低+带宽大)
    v.sort((a,b) => {
        let scoreA = (100 - parseFloat(a.ping)) * 0.5 + parseFloat(a.bandwidth.replace("mb","")) * 0.5;
        let scoreB = (100 - parseFloat(b.ping)) * 0.5 + parseFloat(b.bandwidth.replace("mb","")) * 0.5;
        return scoreB - scoreA;
    });
    return v[0];
}

$httpClient.get({
    url: realUrl,
    headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" },
    timeout: 15000 
}, function(error, response, data) {
    
    // 网络错误处理
    if (error || response.status !== 200) {
        $done({
            title: "CF优选失败",
            content: "网络错误",
            icon: "exclamationmark.triangle",
            backgroundColor: "#FF3B30"
        });
        return;
    }

    try {
        let bodyObj = JSON.parse(data);
        let d = bodyObj.data;
        if (!d) throw new Error("API返回空数据");

        let cmcc = getBestIP(d.cmcc ? d.cmcc.info : null); // 移动
        let ctcc = getBestIP(d.ctcc ? d.ctcc.info : null); // 电信
        let cucc = getBestIP(d.cucc ? d.cucc.info : null); // 联通
        let ipv6 = getBestIP(d.ipv6 ? d.ipv6.info : null); // IPv6

        // === 美化排版函数 ===
        function fmt(item, isV6) {
            if (!item) return "无数据";
            let ip = item.ip;
            // IPv6 截断处理，防止换行
            if (isV6 && ip.length > 15) {
                ip = ip.substring(0, 13) + "..";
            }
            // 延迟和带宽取整
            let p = Math.round(parseFloat(item.ping));
            let b = Math.round(parseFloat(item.bandwidth));
            return `${ip} (${p}/${b}M)`;
        }

        // 1. 构建卡片内容 (Tile Content)
        let tileText = "";
        tileText += `📱 ${fmt(cmcc, false)}\n`;
        tileText += `🌐 ${fmt(ctcc, false)}\n`;
        tileText += `📶 ${fmt(cucc, false)}\n`;
        tileText += `🦕 ${fmt(ipv6, true)}`;

        // 2. 构建详细日志 (Log Content) - 用于复制
        let logText = "=========== Cloudflare 优选结果 ===========\n";
        logText += "格式：IP (延迟ms / 带宽MB)\n";
        logText += "----------------------------------------\n";
        if(cmcc) logText += `📱 移动: ${cmcc.ip} (${cmcc.ping}ms / ${cmcc.bandwidth}MB)\n`;
        if(ctcc) logText += `🌐 电信: ${ctcc.ip} (${ctcc.ping}ms / ${ctcc.bandwidth}MB)\n`;
        if(cucc) logText += `📶 联通: ${cucc.ip} (${cucc.ping}ms / ${cucc.bandwidth}MB)\n`;
        if(ipv6) logText += `🦕 IPv6: ${ipv6.ip} (${ipv6.ping}ms / ${ipv6.bandwidth}MB)`;
        logText += "\n========================================";

        // 打印日志 (重要：去 Stash -> 工具 -> 日志 里长按复制)
        console.log("\n" + logText + "\n");

        // 3. 动态背景颜色
        let allPings = [cmcc, ctcc, cucc, ipv6].filter(x => x).map(x => parseFloat(x.ping));
        let minPing = Math.min(...allPings);
        let bgColor = "#34C759"; // 绿色
        if (minPing > 100) bgColor = "#FF9500"; // 橙色
        if (minPing > 200) bgColor = "#FF3B30"; // 红色

        // 4. 完成 (更新首页卡片)
        $done({
            title: "CF优选 (延迟/带宽)",
            content: tileText,
            icon: "network",
            backgroundColor: bgColor
        });

        // 5. 弹窗通知 (可选，如果不想弹窗可注释掉)
        if (typeof $notification !== 'undefined') {
             $notification.post("CF 优选完成", "详细结果已写入日志", "请去日志页面复制IP");
        }

    } catch (e) {
        $done({
            title: "脚本错误",
            content: "解析异常: " + e.message,
            icon: "xmark.octagon",
            backgroundColor: "#FF3B30"
        });
    }
});
