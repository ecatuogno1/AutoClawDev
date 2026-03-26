SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

REPO_ROOT := $(CURDIR)
LOCAL_BIN := $(HOME)/.local/bin
DATA_ROOT := $(HOME)/.local/lib/autoclawdev
PROJECTS_DIR := $(DATA_ROOT)/projects
WORKSPACE := $(HOME)/.openclaw/workspace/autoresearch
INSTALL_LINKS := \
	"$(REPO_ROOT)/bin/autoclawdev $(LOCAL_BIN)/autoclawdev" \
	"$(REPO_ROOT)/bin/autoclawdev $(LOCAL_BIN)/autoclaw" \
	"$(REPO_ROOT)/bin/autoclawdev-ui $(LOCAL_BIN)/autoclawdev-ui" \
	"$(REPO_ROOT)/scripts/runner.sh $(WORKSPACE)/runner.sh"

.PHONY: help dirs build install install-links update uninstall doctor smoke

help:
	@printf "Targets:\n"
	@printf "  make install    Build and install repo-managed symlinks\n"
	@printf "  make update     Rebuild and refresh symlinks\n"
	@printf "  make uninstall  Remove repo-managed symlinks only\n"
	@printf "  make build      Build web and server apps\n"
	@printf "  make doctor     Verify local prerequisites and install state\n"
	@printf "  make smoke      Run a non-destructive installed-command smoke test\n"

dirs:
	@mkdir -p "$(LOCAL_BIN)" "$(PROJECTS_DIR)" "$(WORKSPACE)"

build:
	@pnpm build

install-links: dirs
	@chmod +x "$(REPO_ROOT)/bin/autoclawdev" "$(REPO_ROOT)/bin/autoclawdev-ui" "$(REPO_ROOT)/scripts/runner.sh"
	@for spec in $(INSTALL_LINKS); do \
		source_path="$${spec%% *}"; \
		target_path="$${spec#* }"; \
		if [ -e "$$target_path" ] && [ ! -L "$$target_path" ]; then \
			backup_path="$$target_path.pre-autoclawdev.$$(date +%Y%m%d%H%M%S).bak"; \
			mv "$$target_path" "$$backup_path"; \
			printf "Backed up %s -> %s\n" "$$target_path" "$$backup_path"; \
		fi; \
		ln -sfn "$$source_path" "$$target_path"; \
		printf "Linked %s -> %s\n" "$$target_path" "$$source_path"; \
	done

install: build install-links
	@"$(REPO_ROOT)/bin/autoclawdev" doctor

update: install

uninstall:
	@for spec in $(INSTALL_LINKS); do \
		source_path="$${spec%% *}"; \
		target_path="$${spec#* }"; \
		if [ -L "$$target_path" ] && [ "$$(readlink "$$target_path")" = "$$source_path" ]; then \
			rm -f "$$target_path"; \
			printf "Removed %s\n" "$$target_path"; \
		else \
			printf "Skipped %s (not a repo-managed symlink)\n" "$$target_path"; \
		fi; \
	done

doctor: dirs
	@command -v bash >/dev/null
	@command -v node >/dev/null
	@command -v pnpm >/dev/null
	@command -v python3 >/dev/null
	@"$(REPO_ROOT)/bin/autoclawdev" doctor

smoke: install
	@command -v autoclawdev >/dev/null
	@command -v autoclawdev-ui >/dev/null
	@autoclawdev help >/dev/null
	@autoclawdev doctor >/dev/null
	@autoclawdev list >/dev/null
	@autoclawdev status >/dev/null
	@AUTOCLAWDEV_UI_PID_FILE="$(WORKSPACE)/autoclawdev-ui-smoke.pid" autoclawdev-ui --background --no-open >/dev/null
	@curl -fsS "http://localhost:4100/api/projects" >/dev/null
	@curl -fsS "http://localhost:4100/api/active" >/dev/null
	@AUTOCLAWDEV_UI_PID_FILE="$(WORKSPACE)/autoclawdev-ui-smoke.pid" autoclawdev-ui --stop >/dev/null || true
	@printf "Smoke checks passed.\n"
