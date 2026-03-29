# PureWolf Browser Extension

**PureWolf** is a cross-browser **Tela client extension for DERO**.  
It turns your browser into a real on-chain web browser by connecting to a small **native helper** written in Go.

With PureWolf you can:

-   🌐 Load **Tela websites** directly in your browser
    
-   🔎 Search and resolve **SCIDs** using the Tela indexer
    
-   ⚙️ Start and control **TELA + Gnomon** from the extension
    
-   🖥️ Serve sites locally — no gateways, no proxies, no fake web
    

PureWolf works on **Firefox and ~~Chrome~~** and installs safely in your **user folder only**.

To start using **PureWolf** install the browser extension for your browser
    Firefox: *[Firefox add-on](`https://addons.mozilla.org/en-US/firefox/addon/purewolf/?utm_source=addons.mozilla.org&utm_medium=referral&utm_content=search`)*

After install run the extension and follow the help instructions in the dashboard to install the native helper.

----------

## Features

-   Cross-browser support (Firefox, Chrome)
    
-   Go-based native helper (`purewolf-native`)
    
-   Firefox Native Messaging integration
    
-   Secure, user-local install (no sudo, no system files)
    
-   Automatic manifest patching
    
-   One-command native installer
    
-   Shared extension code with browser-specific manifests
    

----------

## Repository Structure

```
purewolf/
├── extension/                  # Shared extension code & UI
│   ├── js/                     # Background scripts and content scripts
│   ├── css/                    # Stylesheets for extension UI
│   ├── dashboard/              # Dashboard / popup components
│   ├── libs/                   # Third-party libraries
│   ├── popup/                  # Popup / dashboard UI HTML
│   └── icons/                  # Extension icons
│
├── browsers/                   # Browser-specific manifests
│   ├── firefox/manifest.json
│   └── chrome/manifest.json
│
├── native/                     # Native helper
│   ├── main.go                 # Go entry point
│   ├── com.purewolf.json       # Native messaging manifest template
│   ├── install.sh              # One-command installer
│   └── go.mod / go.sum         # Go module files
│
├── releases/                   # Optional prebuilt binaries or ZIPs
├── scripts/                    # Utility scripts (build, packaging, etc.)
├── README.md
└── LICENSE

```

----------

## Installation

PureWolf requires **two parts**: the browser extension and the native helper.

----------

### 1. Install the browser extension

#### Firefox

-   Load the packaged `.xpi` file  
    **or**
    
-   Go to `about:debugging` → _This Firefox_ → _Load Temporary Add-on_
    

#### ~~Chrome~~ Comming soon

1.  Open `chrome://extensions/`
    
2.  Enable **Developer mode**
    
3.  Click **Load unpacked**
    
4.  Select `browsers/chrome/`
    

> ⚠️ Only load the folder for your browser. The extension code is shared — the manifest controls browser-specific behavior.

----------

### 2. Install the native helper

The native helper is required to:

-   Start and control TELA
    
-   Read local site folders
    
-   Resolve SCIDs
    
-   Serve pages locally
    

#### Linux / macOS

From the repository root:

```bash
cd native
chmod +x install.sh
./install.sh

```

#### What the installer does

-   Creates `~/.purewolf/` and copies the binary (`purewolf-native`)
    
-   Creates browser-specific native messaging folders and copies the manifest (`com.purewolf.json`)
    
    -   Firefox → `~/.mozilla/native-messaging-hosts/`
        
    -   Chrome → `~/.config/google-chrome/NativeMessagingHosts/`
        
    -   Edge → `~/.config/microsoft-edge/NativeMessagingHosts/`
        
-   Replaces `/home/USERNAME` in the manifest with your actual home folder
    
-   Sets executable permissions
    
-   No sudo required
    

----------

### 3. Restart your browser

Close and reopen the browser so the native host is detected.

When working, the extension will show:

> 🟢 **Native connected**

If not installed or detected:

> 🔴 **Native not found**

----------

### 4. Connect a node

-   It is recommended to use your own local node for the best performance and reliability.
    
-   Public nodes also work well — load a node from the **Bookmarks** page and click **Connect**.
    
-   Expect loading times from public nodes to be around **3–5 seconds**, while local nodes are nearly instant.
    

----------

## Development

### Build the Go native helper

```bash
cd native
go build -o ~/.purewolf/purewolf-native

```

### Package the browser extension

```bash
bash build-extension.sh firefox
bash build-extension.sh chrome
```

This copies shared extension code and injects the correct manifest for the target browser.

----------

## Contributing

-   Fork the repository
    
-   Keep shared logic in `extension/`
    
-   Browser-specific files go in `browsers/<browser>/`
    
-   Submit clear, focused pull requests
    

----------

## License

MIT License — see `LICENSE`.

----------

### Recommended Workflow for Users

1.  Install and Load the browser extension for your browser
    Firefox: *[Firefox add-on](`https://addons.mozilla.org/en-US/firefox/addon/purewolf/?utm_source=addons.mozilla.org&utm_medium=referral&utm_content=search`)*

2.  Install the native helper via *[Releases](`https://github.com/ArcaneSphere/PureWolf-Browser-Extension/releases`)*
    
3.  Connect a node
    
4.  Browse Tela sites and SCIDs directly from DERO 🚀

