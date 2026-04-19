let url = $request.url;

// 使用正则检查 URL 是否以图片或视频格式结尾
let isMedia = /\.(jpg|jpeg|png|gif|webp|mp4|m3u8|ts)$/i.test(url.split('?')[0]);

if (isMedia) {
    // 如果是图片/视频，直接静默放行，不弹窗
    $done({ body: $response.body });
} else {
    // 抓到了非媒体请求！这极有可能就是我们要的 API 接口
    console.log("[JavDB测试-抓到接口] " + url);
    
    if (typeof $environment !== 'undefined' && $environment['stash-version']) {
        $notification.post("🎯 抓到疑似接口！", "请截图包含此通知的屏幕", url);
    } else {
        $notification.post("🎯 抓到疑似接口！", "请截图包含此通知的屏幕", url);
    }
    
    $done({ body: $response.body });
}
