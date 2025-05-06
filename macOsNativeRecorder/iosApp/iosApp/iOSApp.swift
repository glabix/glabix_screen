import SwiftUI


@main
struct iOSApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject var cameraViewModel: CameraViewModel = .init()
    @State var mainWindow: NSWindow?
    @State var cameraWindow: NSWindow?
    @Environment(\.openWindow) private var openWindow
    
	var body: some Scene {
//        Window("cam", id: "camera") {
//            ZStack {
//                Color.black.opacity(0.1)
//                Text("ok")
//            }
//        }
//        
//        .windowIdealSize(.maximum)
        
        Window("main", id: WindowId.main.id) {
//            Window("Some", id: "camera") {
//                Color.black.opacity(0.1)
//                Text("ok")
//            }
//            .windowLevel(.floating)
            
            ContentView(
                cameraViewModel: cameraViewModel
            )
            .background(WindowAccessor(window: self.$mainWindow))
            .frame(width: 300)
            .frame(maxHeight: .infinity)
            .onChange(of: mainWindow) { window in
                window?.collectionBehavior = [.canJoinAllSpaces]
                window?.makeKeyAndOrderFront(nil)
                window?.orderFrontRegardless()
                window?.level = .statusBar
            }
//                .onAppear {
//                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
////                        debugPrint("wind", appDelegate.window)
//                        if let window = appDelegate.overlayWindow {
//                            window.toggleFullScreen(nil)
//                        }
//                    }
//                }
//                        .handlesExternalEvents(preferring: [], allowing: [])
        }
//        .defaultLaunchBehavior(.presented)
//        .windowLevel(.floating)
//        .windowToolbarLabelStyle(fixed: .iconOnly)
        .windowToolbarStyle(.expanded)
        .windowResizability(.contentSize)
        
        Window("Camera", id: WindowId.camera.id) {
//            Color.red
            VStack {
                CameraContentView(
                    viewModel: cameraViewModel
                )
                //            .allowsHitTesting(false)
                
                //            .windowDismissBehavior(.disabled)
                .frame(width: cameraViewModel.size.width, height: cameraViewModel.size.height)
                //            .fixedSize(horizontal: true, vertical: false)
                .background(WindowAccessor(window: self.$cameraWindow))
                .backgroundStyle(.clear)
                
                .onChange(of: cameraWindow) { window in
                    window?.isOpaque = false
                    window?.backgroundColor = .clear
                    
                    window?.level = .floating
                    window?.styleMask = [.borderless]
                }
                //            .clipShape(.circle)
//                .onReceive(NotificationCenter.default.publisher(for: NSApplication.willTerminateNotification)) { _ in
//                    debugPrint("TERM", cameraWindow)
//                    cameraWindow?.close()
//                }
                
                Button(action: {
                    cameraWindow?.close()
                }, label: {
                    Text("close")
                })
            }
            .opacity(cameraWindow == nil ? 0 : 1)
            .onAppear {
                openWindow(id: WindowId.main.id)
            }
//            .gesture(WindowDragGesture()) // macos
        }
        .windowStyle(.hiddenTitleBar)
//        .windowBackgroundDragBehavior(.enabled)
//        .defaultLaunchBehavior(.presented)
	}
}

