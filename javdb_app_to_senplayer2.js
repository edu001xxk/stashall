let url = $request.url;
console.log("[JavDB测试] 成功拦截到请求: " + url);

if (typeof $environment !== 'undefined' && $environment['stash-version']) {
    $notification.post("拦截测试成功", "Stash 成功接管了请求", url);
} else {
    $notification.post("拦截测试成功", "小火箭成功接管了请求", url);
}

$done({ body: $response.body });