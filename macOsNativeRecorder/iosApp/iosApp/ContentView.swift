import SwiftUI
import AVFoundation
import Combine
import shared

struct ContentView: View {
    @ObservedObject var inputSettings: InputSettings = .init()
    @StateObject var handler: RecordHandler = .init()
    @StateObject var micInputManager: MicInputManager = .init()
    @State var isPanelVisible: Bool = false
    @ObservedObject var cameraViewModel: CameraViewModel
    @State private var screenRect: NSRect?
    @State var areaRect: CGRect?
    
	let greet = Greeting().greet()

    @Environment(\.openWindow) private var openWindow
//    @Dependency(\.closeWindow) private var closeWindow
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    
    
    
	var body: some View {
        let panel = FloatingPanel(view: {
            ZStack {
                SelectAreaPanel(areaRect: $areaRect)

            }.ignoresSafeArea()
                .onKeyPress(.escape) {
                    debugPrint("ESC1")
                    /// Doesn't get called since the Text element isn't focused.
//                    print("Return key pressed!")
                    isPanelVisible = false
                    return .handled
                }
        }, contentRect: screenRect ?? .zero, isPresented: $isPanelVisible)

        
        VStack {
            Text(greet)
            Text(inputSettings.micDeviceName)
            Text(micInputManager.device()?.debugDescription ?? "N/A")
//            Text(cameraInputManager.device()?.debugDescription ?? "N/A")
            
            Picker("Camera", selection: $inputSettings.cameraDeviceName) {
                ForEach(cameraViewModel.options, id: \.self) {
                    Text($0)
                }
            }
            
            Picker("Mic Device", selection: $inputSettings.micDeviceName) {
                ForEach(micInputManager.options, id: \.self) {
                    Text($0)
                }
            }
            
            Button(action: {
//                for screen in Screens.getScreens() {
//                    print(screen.frame)
//                }
                isPanelVisible = true
            }) {
                Text("toggle panel")
            }
            .onChange(of: isPanelVisible) {
                if $0 {
                    screenRect = Screens.mainOrFirst()?.frame
                    panel.orderFront(nil)
                    panel.makeKey()
                    panel.makeKeyAndOrderFront(nil)
                } else {
                    panel.close()
                }
                debugPrint("VIS?", isPanelVisible, $0, screenRect)
            }
            .onChange(of: areaRect) {
                if let rect = $0 {
                    debugPrint("rect", rect)
                }
            }
            
            Button(action: {
                openWindow(id: WindowId.camera.id)
            }) {
                Text("show window")
            }
            
            Button(action: {
//                appDelegate.cameraWindow?.close()
                appDelegate.createOverlay()
            }) {
                Text("show overlay window")
            }
            
            Button(action: {
                appDelegate.overlayWindow?.close()
//                appDelegate.overlayWindow.hide()
                appDelegate.overlayWindow = nil
            }) {
                Text("close window")
            }
            
            HStack {
                Button(action: {
                    handler.printAudioInputDevices()
                }) {
                    Text("mics")
                }
                
//                Button(action: {
//                    handler.printVideoInputDevices()
//                }) {
//                    Text("camera")
//                }
            }
            
            
            HStack {
                Button(action: {
                    Task {
                        do {
                            try await handler.configure()
                        } catch {
                            debugPrint("ERROR", error)
                        }
                    }
                }) {
                    Text("configure")
                }
                .disabled(handler.recording)
                
                Button(action: {
                    do {
                        try handler.start()
                    } catch {
                        debugPrint("ERROR", error)
                    }
                }) {
                    Text("start")
                }
                .disabled(handler.recording)

                Button(action: {
                    Task {
                        try await handler.stop()
                    }
                }) {
                    Text("stop")
                }
                .disabled(!handler.recording)
            }
            HStack {
                Button(action: {
                    handler.pause()
                }) {
                    Text("pause")
                }
                .disabled(!handler.recording || handler.paused)
                
                Button(action: {
                    handler.resume()
                }) {
                    Text("resume")
                }
                .disabled(!handler.recording || !handler.paused)
            }
        }
//        .onAppear {
//            Task {
//                debugPrint("mics", handler.getMicrophone().map { $0.localizedName })
//            }
//        }
        .padding()
        .onChange(of: inputSettings.cameraDeviceName) {
            cameraViewModel.updateWithCurrentDevice()
        }
	}
}



//struct ContentView_Previews: PreviewProvider {
//@Ava
@available(macOS 14.0, *)
#Preview(traits: .fixedLayout(width: 400, height: 200)) {
//	static var previews: some View {
    ContentView(
        cameraViewModel: .init()
    )
//	}
}



struct OverlayContentView: View {
//    @StateObject var cameraInputManager: CameraInputManager = .init()
    
    var body: some View {
        ZStack {
            Text("overlay")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.2))
    }
}


