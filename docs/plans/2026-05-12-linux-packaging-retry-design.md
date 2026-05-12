# Linux Packaging Retry Design

## Context

- The Linux GitHub Actions packaging step failed on 2026-05-12 while downloading Electron with an EOF from the GitHub release asset URL.
- A rerun of the same workflow on the same commit succeeded without any code changes.
- The repository does not currently configure an Electron download mirror or any retry behavior in the Linux workflow.

## Options Considered

1. Leave the workflow unchanged and treat the failure as transient.
2. Add a small retry loop around the Linux packaging step.
3. Add a dedicated Electron mirror configuration.

## Decision

- Choose option 2.
- Keep the existing official download source.
- Retry the Linux packaging step up to three times.
- Clear the Electron download caches between attempts so a partial EOF download does not poison the next attempt.

## Why This Choice

- The rerun evidence points to a transient network/download failure, not a stable packaging misconfiguration.
- A retry loop is the smallest reliable mitigation.
- Adding a mirror increases external dependency surface and operational burden without evidence that the official source is persistently unreliable.

## Verification Plan

- Validate the edited workflow YAML for diagnostics.
- Commit and push the workflow change.
- Confirm the Linux workflow triggered by the new commit completes successfully.