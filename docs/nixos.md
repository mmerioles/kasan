# NixOS VM deployment

This deployment runs Kasan and every agent process directly under systemd in a
dedicated NixOS VM. It does not use Docker. An agent sees everything that the
configured service user can see inside the VM, so use a VM dedicated to Kasan
and do not put unrelated secrets on it.

## Add Kasan to Chimera

The examples below match the sibling `chimera` repository: its flake is in
`chimera/nix`, host modules live under `nix/hosts`, and VMs are deployed with
`nixos-rebuild --flake`.

Add the input and module argument in `chimera/nix/flake.nix`:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

    kasan = {
      url = "github:mmerioles/kasan";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # Existing disko input remains here.
  };

  outputs = { nixpkgs, disko, kasan, ... }: {
    nixosConfigurations.kasan01 = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        disko.nixosModules.disko
        kasan.nixosModules.default
        ./hosts/kasan01/disk-config.nix
        ./hosts/kasan01/configuration.nix
      ];
    };
  };
}
```

Copy an existing Chimera disk configuration to
`nix/hosts/kasan01/disk-config.nix`, then add the usual boot, DHCP, SSH, and
`matt` user settings to `nix/hosts/kasan01/configuration.nix`. The Kasan-specific
part is:

```nix
{ lib, pkgs, ... }:

{
  # claude-code is unfree in nixpkgs.
  nixpkgs.config.allowUnfreePredicate = pkg:
    builtins.elem (lib.getName pkg) [ "claude-code" ];

  services.kasan = {
    enable = true;
    user = "matt";
    group = "users";
    home = "/home/matt";
    dataDir = "/var/lib/kasan/data";
    workspace = "/home/matt/repos";
    environmentFile = "/var/lib/kasan/kasan.env";
    openFirewall = true;

    # Add repository-specific compilers and tools here. They become part of
    # the PATH inherited by Claude and Codex.
    extraPackages = with pkgs; [ go rustup ];
  };

  systemd.tmpfiles.rules = [
    "d /home/matt/repos 0750 matt users -"
    "f /var/lib/kasan/kasan.env 0600 matt users -"
  ];
}
```

Using the existing `matt` account deliberately gives agents the same access
inside the VM as an interactive `matt` shell. The service has no systemd
filesystem sandbox. It is still not root; add narrowly scoped sudo rules only
if a repository truly needs them.

## Deploy and initialize

From `chimera/nix`:

```bash
nix flake lock --update-input kasan
nix run nixpkgs#nixos-rebuild -- switch \
  --flake .#kasan01 \
  --target-host root@<vm-address> \
  --build-host root@<vm-address>
```

Create the passcode outside the Nix store, then restart Kasan:

```bash
ssh matt@<vm-address>
sudoedit /var/lib/kasan/kasan.env
```

The file must contain:

```dotenv
KASAN_PASSCODE=replace-with-a-long-random-passcode
# ANTHROPIC_API_KEY=optional-alternative-to-interactive-login
```

Then authenticate the CLIs as the service user and start the service:

```bash
codex login --device-auth
claude setup-token
sudo systemctl restart kasan
systemctl status kasan
journalctl -u kasan -f
```

Open `http://<vm-address>:7777`. Prefer a private VLAN or Tailscale; opening the
firewall does not add TLS or make Kasan suitable for the public internet.

## Updating

Update the locked Kasan revision and rebuild the VM:

```bash
nix flake lock --update-input kasan
nix run nixpkgs#nixos-rebuild -- switch \
  --flake .#kasan01 \
  --target-host root@<vm-address> \
  --build-host root@<vm-address>
```

The Nix store package is replaced atomically. Agent credentials in
`/home/matt`, session data in `/var/lib/kasan/data`, and repositories in
`/home/matt/repos` remain persistent.
