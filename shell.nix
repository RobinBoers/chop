{ pkgs ? import <nixpkgs> {} }:

with pkgs;

let inherit (lib) optional optionals; in mkShell {
  buildInputs = [ bun ];
}
