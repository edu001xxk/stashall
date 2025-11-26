/*
 * Cloudflare 节点生成器 - 完整字段修复版
 * 采用您提供的标准 VLESS 格式结构
 */

// 1. 读取优选IP，读不到就用默认的
var savedIP = $persistentStore.read("CF_BEST_IP");
if (!savedIP || savedIP.length < 5) {
    savedIP = "cf.zhetengsha.eu.org"; // 您的默认域名
}

// 2. 定义配置信息 (方便您核对)
var myConfig = {
    uuid: "87d1bfd4-574e-4c96-ad42-0426f27461ff",
    host: "_acme-challenge.2go.cloudns.be",
    path: "/?ed"
};

// 3. 输出节点 (严格按照您给的格式补全了 cipher, flow, sni 等字段)
$done({
  proxies: [{
    "name": "🚀 自动优选 | " + savedIP,
    "type": "vless",
    "server": savedIP,
    "port": 443,
    "uuid": myConfig.uuid,
    "network": "ws",
    "tls": true,
    "udp": true,
    "skip-cert-verify": true,
    
    // 补充字段 (按照您的参考格式)
    "cipher": "auto",
    "flow": "",
    "alterId": 0,
    
    // 关键连接字段
    "servername": myConfig.host,
    "sni": myConfig.host, // 加上了您提到的 sni
    
    "ws-opts": {
      "path": myConfig.path,
      "headers": {
        "Host": myConfig.host
      }
    }
  }]
});
