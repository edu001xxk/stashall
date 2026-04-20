var body = $response.body; // 改用 var 避免引擎垃圾回收 Bug

if (!body) {
    $done({});
    return; // 补上 return 防止 body 为空时崩溃
}

// 1. 匹配标准番号
var idReg = /([a-zA-Z]{2,6}-\d{3,5})/i;
var match = body.match(idReg);

if (match && match[1]) {
    var code = match[1].toLowerCase(); // 改用 var 强制保留变量作用域
    console.log(`\n[JavDB-SenPlayer] 🔍 开始搜索番号: ${code.toUpperCase()}`);

    var jableUrl = `https://jable.tv/videos/${code}/`;

    // 2. 优先请求 Jable
    $httpClient.get({
        url: jableUrl,
        headers: getFakeHeaders()
    }, function(error, response, data) {
        var foundM3u8 = false;

        // 增加了 response 的安全判空
        if (!error && response && response.status === 200) {
            var m3u8Reg = /https?:\/\/[^"'\s<>]+\.m3u8/i;
            var m3u8Match = data ? data.match(m3u8Reg) : null;
            if (m3u8Match) {
                foundM3u8 = true;
                handleSuccess(code, m3u8Match[0], "Jable");
            }
        }
        
        // 3. 原生嵌套结构：Jable 没找到，尝试带 -c 后缀
        if (!foundM3u8) {
            console.log(`[JavDB-SenPlayer] ⚠️ Jable 未找到，尝试加上 -c 后缀...`);
            var jableUrlC = `https://jable.tv/videos/${code}-c/`;
            
            $httpClient.get({
                url: jableUrlC,
                headers: getFakeHeaders()
            }, function(errC, respC, dataC) {
                var foundM3u8C = false;

                if (!errC && respC && respC.status === 200) {
                    var m3u8RegC = /https?:\/\/[^"'\s<>]+\.m3u8/i;
                    var m3u8MatchC = dataC ? dataC.match(m3u8RegC) : null;
                    if (m3u8MatchC) {
                        foundM3u8C = true;
                        handleSuccess(code, m3u8MatchC[0], "Jable");
                    }
                }

                // 4. 备用方案：Jable 均未找到，转去 123AV
                if (!foundM3u8C) {
                    console.log(`[JavDB-SenPlayer] ⚠️ Jable 均未找到或被拦截，转去 123AV...`);
                    // 使用你提供的 123av 格式
                    fetch123AV(`https://123av.com/zh/v/${code}`, code, 0);
                }
            });
        }
    });
} else {
    $done({ body });
}

// ==========================================
// 核心：处理 123AV 请求与 CF 盾诊断
// ==========================================
function fetch123AV(url, code, redirectCount) {
    if (redirectCount > 3) {
        console.log(`[JavDB-SenPlayer] ❌ 123AV 重定向次数过多，已停止请求`);
        $done({ body });
        return;
    }
    
    $httpClient.get({
        url: url,
        headers: getFakeHeaders()
    }, function(err, resp, data) {
        if (err) {
            console.log(`[JavDB-SenPlayer] ❌ 123AV 网络请求直接报错: ${err}`);
            $done({ body });
            return;
        }
        
        if (!resp) {
            $done({ body });
            return;
        }
        
        // 【CF 盾检测】
        if (resp.status === 403 || resp.status === 503) {
            console.log(`[JavDB-SenPlayer] 🛡️ 遭遇 CF 盾拦截！状态码: ${resp.status}`);
            $done({ body });
            return;
        }
        
        // 处理重定向
        if (resp.status === 301 || resp.status === 302 || resp.status === 308) {
            var location = resp.headers['Location'] || resp.headers['location'];
            if (location) {
                if (location.startsWith('/')) {
                    var domain = url.match(/^https?:\/\/[^\/]+/)[0];
                    location = domain + location;
                }
                console.log(`[JavDB-SenPlayer] 🔄 自动跟随重定向至: ${location}`);
                fetch123AV(location, code, redirectCount + 1);
            } else {
                $done({ body });
            }
            return;
        }
        
        // 如果成功获取网页
        if (resp.status === 200) {
            var unescapedData = data ? data.replace(/\\/g, "") : "";
            
            // 【核心修改】兼容 123AV 经常使用的 //cdn 或 /v/ 相对路径
            var m3u8Reg = /((?:https?:)?\/\/[^"'\s<>]+\.m3u8|\/[^"'\s<>]+\.m3u8)/i;
            var m3u8Match = unescapedData.match(m3u8Reg);

            if (m3u8Match && m3u8Match[1]) {
                var m3u8Url = m3u8Match[1];
                // 补全协议和域名
                if (m3u8Url.startsWith("//")) {
                    m3u8Url = "https:" + m3u8Url;
                } else if (m3u8Url.startsWith("/")) {
                    m3u8Url = "https://123av.com" + m3u8Url;
                }
                handleSuccess(code, m3u8Url, "123AV");
            } else {
                console.log(`[JavDB-SenPlayer] ⚠️ 123AV (状态码200) 未找到m3u8。可能是JS加密或该番号不存在。`);
                // 打印前100个字符用于诊断
                console.log(`[网页片段诊断]: ${data ? data.substring(0, 150).replace(/\n/g, '') : ''}`);
                
                if (redirectCount === 0) {
                    console.log(`[JavDB-SenPlayer] 尝试使用搜索接口...`);
                    fetch123AV(`https://123av.com/zh/search/${code}`, code, 1);
                } else {
                    $done({ body });
                }
            }
        } else {
            console.log(`[JavDB-SenPlayer] ❌ 未知错误，状态码: ${resp.status}`);
            $done({ body });
        }
    });
}

// ==========================================
// 伪装请求头（完全保留原样）
// ==========================================
function getFakeHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Connection": "keep-alive"
    };
}

// ==========================================
// 提取成功后的处理函数（完全保留原样）
// ==========================================
function handleSuccess(code, m3u8, source) {
    console.log(`\n==================================`);
    console.log(`🎯 [成功获取 M3U8] 数据源: ${source}`);
    console.log(`🔗 播放链接: ${m3u8}`);
    console.log(`==================================\n`);
    
    var shortcutUrl = `shortcuts://run-shortcut?name=JavPlay&input=text&text=${encodeURIComponent(m3u8)}`;
    var title = `▶ 解析成功 (${source}): ${code.toUpperCase()}`;
    var subtitle = `已找到串流链接并记录至日志`;
    var content = `👇 点击弹窗立即拉起 SenPlayer`;

    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        $notification.post(title, subtitle, content, { url: shortcutUrl });
    } else {
        $notification.post(title, subtitle, content, shortcutUrl);
    }
    $done({ body });
}