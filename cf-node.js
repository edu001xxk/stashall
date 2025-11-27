/* * Cloudflare 节点生成器 - 防呆版
 */
var savedIP = $persistentStore.read("CF_BEST_IP");
var address = "cf.zhetengsha.eu.org"; // 默认保底

// 简单的格式校验
if (savedIP && savedIP.length > 5 && savedIP.indexOf(".") > -1) {
    address = savedIP;
}

$done({
  proxies: [{
    "name": "🚀 自动优选 | " + address,
    "type": "vless",
    "server": address,
    "port": 443,
    "uuid": "87d1bfd4-574e-4c96-ad42-0426f27461ff",
    "tls": true,
    "skip-cert-verify": true,
    "network": "ws",
    "servername": "_acme-challenge.2go.cloudns.be",
    "ws-opts": {
      "path": "/?ed",
      "headers": { "Host": "_acme-challenge.2go.cloudns.be" }
    },
    "udp": true
  }]
});
