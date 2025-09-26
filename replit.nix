{ pkgs }: {
  deps = [
    # Node.js runtime (20.x LTS - 18.x has reached EOL)
    pkgs.nodejs-20_x
    pkgs.nodejs-20_x.pkgs.npm

    # Python for AI/ML packages and build dependencies
    pkgs.python3
    pkgs.python3Packages.pip

    # FFmpeg for video processing (@ffmpeg-installer/ffmpeg)
    pkgs.ffmpeg

    # Chromium and dependencies for puppeteer
    pkgs.chromium
    pkgs.nss
    pkgs.freetype
    pkgs.freetype.dev
    pkgs.fontconfig
    pkgs.fontconfig.dev

    # System libraries for various Node.js native modules
    pkgs.libuuid
    pkgs.libGL
    pkgs.libGLU
    pkgs.xorg.libX11
    pkgs.xorg.libXext
    pkgs.xorg.libXrender
    pkgs.xorg.libxcb
    pkgs.xorg.libXi
    pkgs.xorg.libXtst
    pkgs.xorg.libXrandr
    pkgs.xorg.libXss
    pkgs.xorg.libXcursor
    pkgs.xorg.libXdamage
    pkgs.xorg.libXfixes
    pkgs.xorg.libXcomposite
    pkgs.atk
    pkgs.glib
    pkgs.gtk3
    pkgs.pango
    pkgs.cairo
    pkgs.gdk-pixbuf
    pkgs.alsa-lib

    # Build tools and development dependencies
    pkgs.pkg-config
    pkgs.gcc
    pkgs.gnumake
    pkgs.git
    pkgs.curl
    pkgs.wget

    # Additional libraries for AI/ML and data processing
    pkgs.openssl
    pkgs.zlib
    pkgs.libjpeg
    pkgs.libpng
    pkgs.libtiff

    # TypeScript compiler (global for development)
    pkgs.nodePackages.typescript
    pkgs.nodePackages.tsx
  ];

  env = {
    # Puppeteer configuration to use system chromium
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true";
    PUPPETEER_EXECUTABLE_PATH = "${pkgs.chromium}/bin/chromium";

    # Node.js environment
    NODE_ENV = "production";

    # OpenGL and display configuration for headless Chrome
    DISPLAY = ":0";

    # Python path for any Python dependencies
    PYTHONPATH = "${pkgs.python3}/lib/python3.11/site-packages";
  };
}