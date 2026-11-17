#import "AppDelegate.h"
#import <WebKit/WebKit.h>

@implementation AppDelegate
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {
    self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
    UIViewController *controller = [UIViewController new];
    controller.view.backgroundColor = UIColor.systemBackgroundColor;
    WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
    WKWebView *webView = [[WKWebView alloc] initWithFrame:controller.view.bounds configuration:configuration];
    webView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    webView.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
    NSURL *url = [NSBundle.mainBundle URLForResource:@"index" withExtension:@"html"];
    if (url) {
        NSError *readError = nil;
        NSString *html = [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:&readError];
        if (html && !readError) [webView loadHTMLString:html baseURL:NSBundle.mainBundle.bundleURL];
        else [webView loadHTMLString:@"<body style='background:#111;color:#fff;font:18px -apple-system;padding:32px'>Não foi possível carregar a interface da Aura.</body>" baseURL:nil];
    } else {
        [webView loadHTMLString:@"<meta name='viewport' content='width=device-width'><body style='background:#111;color:#fff;font:18px -apple-system;padding:32px'>A interface da Aura não foi encontrada.</body>" baseURL:nil];
    }
    [controller.view addSubview:webView];
    self.window.rootViewController = controller;
    [self.window makeKeyAndVisible];
    return YES;
}
@end
