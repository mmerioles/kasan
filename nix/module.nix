{ config, lib, pkgs, ... }:

let
  cfg = config.services.kasan;
  packageIfPresent = name:
    let value = lib.attrByPath [ name ] null pkgs;
    in lib.optional (value != null) value;
  defaultTools =
    (packageIfPresent "codex") ++
    (packageIfPresent "claude-code") ++
    (packageIfPresent "playwright-mcp") ++
    (with pkgs; [
      git ripgrep curl wget less openssh procps chromium
      gcc gnumake python3 jq unzip zip sqlite shellcheck
      netcat lsof librsvg imagemagick nodejs_24
    ]);
in {
  options.services.kasan = {
    enable = lib.mkEnableOption "the Kasan coding-agent control room";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ./package.nix { };
      defaultText = lib.literalExpression "pkgs.callPackage <kasan/nix/package.nix> { }";
      description = "Kasan package to run.";
    };
    user = lib.mkOption {
      type = lib.types.str;
      default = "kasan";
      description = "Existing VM user that runs Kasan and its agents.";
    };
    group = lib.mkOption {
      type = lib.types.str;
      default = cfg.user;
      description = "Primary group for the Kasan service.";
    };
    home = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/kasan/home";
      description = "Persistent home containing agent credentials and configuration.";
    };
    dataDir = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/kasan/data";
      description = "Persistent Kasan session database directory.";
    };
    workspace = lib.mkOption {
      type = lib.types.str;
      default = "/workspace";
      description = "Comma-separated VM paths agents may use as repositories.";
    };
    environmentFile = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/kasan/kasan.env";
      description = "Root-managed environment file containing KASAN_PASSCODE and optional API keys.";
    };
    port = lib.mkOption {
      type = lib.types.port;
      default = 7777;
    };
    idleMinutes = lib.mkOption {
      type = lib.types.nonnegativeInt;
      default = 60;
    };
    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Open the Kasan TCP port in the VM firewall.";
    };
    extraPackages = lib.mkOption {
      type = with lib.types; listOf package;
      default = [ ];
      description = "Additional tools made available to coding-agent processes.";
    };
  };

  config = lib.mkIf cfg.enable {
    # The CLI programs must also be available in an interactive login shell so
    # the service user can complete device authentication.
    environment.systemPackages = defaultTools ++ cfg.extraPackages ++ [ cfg.package ];

    users.groups = lib.mkIf (cfg.group == "kasan") { kasan = { }; };
    users.users = lib.mkIf (cfg.user == "kasan") {
      kasan = {
        isSystemUser = true;
        group = cfg.group;
        home = cfg.home;
        createHome = true;
      };
    };

    systemd.tmpfiles.rules = [
      "d ${cfg.home} 0700 ${cfg.user} ${cfg.group} -"
      "d ${cfg.dataDir} 0750 ${cfg.user} ${cfg.group} -"
    ];

    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ cfg.port ];

    systemd.services.kasan = {
      description = "Kasan coding-agent control room";
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ];
      after = [ "network-online.target" "systemd-tmpfiles-setup.service" ];
      path = defaultTools ++ cfg.extraPackages ++ [ cfg.package ];
      environment = {
        HOME = cfg.home;
        KASAN_APP_DIR = "${cfg.package}/lib/kasan";
        KASAN_CHROMIUM_BIN = "${pkgs.chromium}/bin/chromium";
        KASAN_DATA = cfg.dataDir;
        KASAN_WORKSPACE = cfg.workspace;
        KASAN_PORT = toString cfg.port;
        KASAN_IDLE_MINUTES = toString cfg.idleMinutes;
      };
      serviceConfig = {
        User = cfg.user;
        Group = cfg.group;
        EnvironmentFile = cfg.environmentFile;
        ExecStart = "${cfg.package}/lib/kasan/scripts/kasan-entrypoint.sh ${lib.getExe cfg.package}";
        Restart = "on-failure";
        RestartSec = "5s";
        WorkingDirectory = cfg.home;
        UMask = "0027";
      };
    };
  };
}
