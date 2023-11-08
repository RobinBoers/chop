{ pkgs ? import <nixpkgs> {} }:

with pkgs;

let inherit (lib) optional optionals; in mkShell {
  buildInputs = [ bun minify optipng pngcrush jpegoptim imagemagick nodePackages.terser nodePackages.svgo nodePackages.prettier ];
}
