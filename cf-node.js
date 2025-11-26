/*
 * Cloudflare 节点生成器 - 静态保底版
 * 用于测试 Stash 脚本通道是否打通
 */

$done({
  proxies: [
    {
      "name": "🚀 自动优选 | 调试模式",
      "type": "vless",
      "server": "cf.zhetengsha.eu.org",
      "port": 443,
      "uuid": "87d1bfd4-574e-4c96-ad42-0426f27461ff",
      "tls": true,
      "skip-cert-verify": true,
      "network": "ws",
      "servername": "_acme-challenge.2go.cloudns.be",
      "ws-opts": {
        "path": "/?ed",
        "headers": {
          "Host": "_acme-challenge.2go.cloudns.be"
        }
      },
      "udp": true
    }
  ]
});
