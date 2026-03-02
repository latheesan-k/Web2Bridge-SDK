{
  description = "Web2Bridge SDK - Development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Node.js LTS (18 or later)
            nodejs_20

            # pnpm package manager (v9)
            nodePackages.pnpm

            # Useful development tools
            git

            # For native dependencies compilation
            python3
            pkg-config
          ];

          shellHook = ''
            echo "🚀 Web2Bridge SDK Development Environment"
            echo ""
            echo "Node.js version: $(node --version)"
            echo "pnpm version: $(pnpm --version)"
            echo ""
            echo "Available commands:"
            echo "  pnpm install    - Install dependencies"
            echo "  pnpm build      - Build all packages"
            echo "  pnpm test       - Run all tests"
            echo "  pnpm lint       - Lint all packages"
            echo "  pnpm typecheck  - Type-check all packages"
            echo "  pnpm clean      - Clean build artifacts"
            echo ""
            echo "To run the demo:"
            echo "  cd demo && pnpm dev"
            echo ""
          '';

          # Set environment variables
          TURBO_TELEMETRY_DISABLED = "1";
        };
      }
    );
}
