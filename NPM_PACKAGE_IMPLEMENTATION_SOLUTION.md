# Streamdown npm Package: Implementation Solution

## Goal

Convert the current Streamdown codebase into a professional, versioned npm package that is easy to install, safe to upgrade, and reliable in production.

## Recommended Delivery Approach

## Phase 1: Package Architecture and API Freeze

1. Define the public API surface:
   - `AnimatedMarkdown`
   - exported types (`AnimatedMarkdownProps`, presence types, patch types)
   - optional utility exports (only stable ones)
2. Separate **internal** modules from **public** modules.
3. Add a single package entry strategy:
   - `src/index.ts` for public exports only.
4. Remove accidental deep-import paths from documentation/examples.

### Deliverables

- Final export map draft
- `src/index.ts` public entry
- API boundary document

## Phase 2: Build System and Package Metadata

1. Add package build tooling (`tsup` or Rollup-based setup).
2. Output:
   - `dist/index.js` (ESM)
   - `dist/index.cjs` (CJS)
   - `dist/index.d.ts` (types)
3. Configure `package.json` fields:
   - `name`, `version`, `type`
   - `main`, `module`, `types`
   - `exports` map
   - `files`
   - `peerDependencies` (React/Next-related runtime requirements)
4. Ensure CSS strategy is clear:
   - explicit style import path and usage docs.

### Deliverables

- Reproducible package build
- Clean `package.json` for publishing
- Correct type declarations

## Phase 3: Quality Gates and Release Safety

1. CI checks for every release candidate:
   - lint
   - unit tests
   - type-check
   - package build
2. Add prepublish validation:
   - package can be packed (`npm pack`) without missing files.
3. Add smoke test app:
   - install packed tarball and verify runtime behavior.

### Deliverables

- Release CI workflow
- `npm pack` validation script
- Smoke test result

## Phase 4: Documentation and Developer Experience

1. Write package docs:
   - install instructions
   - quick-start example
   - required styles
   - common pitfalls and troubleshooting
2. Add migration/versioning policy:
   - semantic versioning
   - breaking-change notes
3. Add changelog/release template.

### Deliverables

- `README` package section ready for external users
- Versioning and changelog policy
- First release notes template

## Phase 5: Publish and Post-Release Support

1. Publish strategy:
   - start with `next` tag or private scope for controlled rollout.
   - promote to `latest` after validation.
2. Monitor first adopters:
   - collect integration feedback
   - fix onboarding friction quickly
3. Publish patch release if needed.

### Deliverables

- First published package release
- Post-release validation report
- Patch policy

## Suggested Timeline

- **Week 1**: Phase 1 and Phase 2
- **Week 2**: Phase 3 and Phase 4
- **Week 3**: Phase 5 (publish, monitor, patch if needed)

## Risks and Mitigations

- **Risk**: unstable API changes during packaging  
  **Mitigation**: API freeze before build work starts.

- **Risk**: consumer environment mismatch (React/Next versions)  
  **Mitigation**: strict peer dependency range and compatibility table.

- **Risk**: CSS or rendering mismatch in host apps  
  **Mitigation**: explicit style contract and smoke test app.

## Definition of Done

- Package installs with `npm install <package-name>`
- Typed imports work with no manual config
- Demo scenario behavior matches current repo behavior
- CI release checks pass
- Docs are sufficient for first-time integration
- Versioned release published successfully

## Optional Enhancements (Upsell Opportunities)

- Storybook documentation site for props and live playground.
- Private enterprise package channel with token-based distribution.
- Telemetry-ready debug hooks for production observability.
- Adapter presets for common host stacks.
