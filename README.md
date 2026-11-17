# Aura for iOS

Aura is a prototype chat interface for managing a jailbroken iPhone from a computer on the same network. It pairs a Node.js bridge with a browser client and an Objective-C client built around `WKWebView`. The interface is in Brazilian Portuguese.

The bridge uses a signed-in Codex CLI to interpret requests and SSH to run supported device actions. Aura can check device status and read preferences. Editing a preference, restarting the iOS interface, or rebooting userspace requires confirmation in the client.

## Run the browser client

You need Node.js, a signed-in Codex CLI, an OpenSSH client, and SSH access to your own jailbroken iPhone as `mobile`.

1. Set `IPHONE_IP` to your phone's address, `IPHONE_SSH_KEY` to your private key's local path, and `IPHONE_KNOWN_HOSTS` to a local file containing the verified device host key.
2. From `server/`, run `npm start`. Aura listens on `127.0.0.1:8787` by default for local testing.
3. To connect from the iPhone, set `AURA_HOST` to your computer's LAN address before starting the server. Open the address printed by Aura in Safari and enter the six-digit access code from the terminal.

Use a trusted local network. The prototype uses HTTP and passes device output to the Codex CLI to produce replies. Keep private keys and local connection settings outside the repository.

## Native iOS client

The `native/` directory contains a Theos project for iOS 15 and arm64. With Theos and the iOS 16.5 SDK configured, run `make package` from `native/`. In Aura, open **Conexão** and enter the desktop server address and access code.

## Project layout

| Directory | Contents |
| --- | --- |
| [`server/`](server/) | Node.js bridge, action schema, and browser client. |
| [`native/`](native/) | Objective-C app, Theos package configuration, and bundled interface. |
