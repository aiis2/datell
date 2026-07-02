# Datell 1.0.7 Release Notes

## Highlights

- Added Agent-generated report templates from screenshots.
- Added support for inserting screenshot-inspired template blocks into the currently selected template.
- Added template source metadata so Agent-created templates can be identified and reused immediately.
- Added a lightweight GitHub Actions compile-and-test workflow for PR and feature branch validation.

## Validation

- Template generation now validates unsafe remote resources, dangerous script patterns, inline JavaScript syntax, and report interactivity rules before saving.
- Image uploads now preserve natural dimensions and aspect ratio for template generation prompts.
