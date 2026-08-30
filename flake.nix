{
  description = "Kasan coding-agent control room";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs }:
    let
      forAllSystems = nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" ];
    in {
      packages = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system};
        in {
          default = pkgs.callPackage ./nix/package.nix { };
          kasan = self.packages.${system}.default;
        });

      nixosModules.default = import ./nix/module.nix;
      nixosModules.kasan = self.nixosModules.default;
    };
}
