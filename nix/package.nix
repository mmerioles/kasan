{ lib, buildNpmPackage, importNpmLock, makeWrapper, nodejs_24 }:

buildNpmPackage {
  pname = "kasan";
  version = "0.1.0";
  src = lib.cleanSource ../.;

  nodejs = nodejs_24;
  npmDeps = importNpmLock { npmRoot = ../.; };
  npmConfigHook = importNpmLock.npmConfigHook;
  nativeBuildInputs = [ makeWrapper ];

  npmBuildScript = "build";
  dontNpmPrune = true;

  installPhase = ''
    runHook preInstall
    npm prune --omit=dev
    mkdir -p $out/lib/kasan $out/bin
    cp -r server scripts skills web/dist package.json node_modules $out/lib/kasan/
    chmod +x $out/lib/kasan/scripts/kasan-entrypoint.sh $out/lib/kasan/scripts/kasan-preview.mjs
    ln -s $out/lib/kasan/scripts/kasan-preview.mjs $out/bin/kasan-preview
    makeWrapper ${nodejs_24}/bin/node $out/bin/kasan \
      --add-flags "$out/lib/kasan/server/index.ts" \
      --set-default KASAN_APP_DIR "$out/lib/kasan"
    runHook postInstall
  '';

  meta = {
    description = "A quiet control room for coding agents";
    homepage = "https://github.com/mmerioles/kasan";
    license = lib.licenses.mit;
    mainProgram = "kasan";
    platforms = lib.platforms.linux;
  };
}
