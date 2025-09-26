{ pkgs }: {
  deps = [
    pkgs.nodejs-20_x
    pkgs.nodePackages.typescript
    pkgs.nodePackages.typescript-language-server
    pkgs.esbuild
    pkgs.nodePackages.tsx
    pkgs.nodePackages.vite
  ];
}