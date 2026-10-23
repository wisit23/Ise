# Order Service class diagram

Editable source: [OrderServiceClassDiagram.drawio](./OrderServiceClassDiagram.drawio). Interactive local preview: [preview.html](./preview.html).

Saved in the user's existing [diagrams.net file](https://app.diagrams.net/#G1Z1l4LfqPGYcVP4AZMvKpx-F7ZvN7hfCT#%7B%22pageId%22%3A%2201%22%7D) on 2026-10-17 (Asia/Bangkok). The existing page ID `01` is preserved. The original file contained only an empty graph; its bytes are preserved in `original.drawio`. `drive-readback.drawio` is the completed file downloaded from Drive after the write.

## Contents

1. Domain overview: all 18 logical domain classes and all 18 local relations. Every class has three compartments: name, selected attributes, and operations.
2. Commerce details: complete scalar attributes and allocated operations for 11 classes.
3. Dispute details: complete scalar attributes and allocated operations for 8 classes. `Order` is intentionally repeated as context.
4. Application operations: module bindings/configuration and selected exported functions from 12 actual JavaScript modules, plus 13 selected caller dependencies. This page is not an exhaustive source dependency graph.

The domain pages are a logical OO design projection of the current implementation. They allocate procedural service behavior to domain responsibilities, rather than claiming the Prisma model instances implement these methods. `operations.json` maps every domain class to the source behavior behind its operations. Design operation names such as `Payment.recordPaid`, `Evidence.attach`, and log `append` describe existing writes; those names are not literal functions in the current modules. Signatures omit execution context and some parameters. Page 04 retains actual selected module function names; its attributes show bindings/configuration, with product-client getter values explicitly marked derived.

The diagram reflects the checked-out source, including the current operational storage schema. Older planning documents and copied schemas are not used as the source of truth. No application source or existing tests were changed by this task.

Presentation: every outline, compartment separator, connector and arrowhead is black. Class header and body fills are transparent (`fillColor=none`, `swimlaneFillColor=none`); no opacity change hides the text or lines. This style is applied on all four pages. The style update preserved all class content, relation endpoints, multiplicities and geometry.

## Relationship decisions

- Source: `backend/services/order-service/prisma/schema.prisma`. All 18 `@relation(fields: ...)` entries appear once on page 01. Their FK names and association roles are retained in `relations.json`; role labels are suppressed in the diagram for legibility.
- A required FK gives `1` at the referenced class; a nullable FK gives `0..1`. A unique FK or PK gives `0..1` at the dependent class; other dependent collections give `0..*`. A parent can exist before dependent records are created.
- `Checkout` to `Order`: `0..1` at Checkout, `0..*` at Order. Application checkout creation requires 1–20 selected orders; that precondition is stated separately from schema multiplicity.
- `Basket` to `Order`: `0..1` at both ends, because `Order.basketId` is nullable and unique.
- `Order` to `Payment`: `1` / `0..*`, permitting payment history and simulated refunds.
- `Order` to `Shipping`, `DisputeCase`, and `AttributionJob`: `1` / `0..1` in each case.
- `DisputeEvidence` to `Evidence`: `1` / `0..*`. `SafetyDisputeEvidence.evidenceId` references **DisputeEvidence**, not the file-reference model `Evidence`; it is unique, so the opposite SafetyDisputeEvidence end is `0..1`.
- Associations are plain solid lines with navigability unspecified. FK direction does not imply UML navigability. No inheritance, aggregation, or composition is invented from a database FK or delete cascade alone.
- Module dependencies are dashed lines with open arrowheads pointing from caller to supplier. They have no multiplicity. All pages combine attributes and functions inside each classifier box; pages 01–03 allocate operations as an OO design, and page 04 shows module functions.
- Cross-service buyer, seller, product, address, campaign, auction, staff and chat references remain scalar IDs. They are not drawn as local database relations. Text status fields are not represented as invented enums.

Notation reference: [OMG UML 2.5.1](https://www.omg.org/spec/UML/2.5.1/PDF), Dependency and Association sections.

## Verification performed

- Validated unique cell IDs, complete model coverage, relation endpoints, nonoverlapping class bounds, and both attribute/function compartments in every class/module box.
- Opened all four pages with the real diagrams.net application and exported `page-01.svg` through `page-04.svg` from its graph renderer.
- Checked rendered edge segments against unrelated class boxes: zero intersections on every page. Visually inspected overview and all detail pages, including multiplicity positions and dependency arrowheads.
- Checked selected operation names and dependency directions against their source modules. Parameter lists are abbreviated for presentation; dynamically inferred return types are omitted.
- Confirmed the Drive file was still the original empty file immediately before writing. Updated the same Drive file ID, preserving its title and sharing configuration.
- Downloaded the saved Drive file and compared parsed XML with the generated source: exact match; all four page IDs and names preserved.
- Rendered and inspected the interactive HTML preview with no console errors.

Regenerate the editable XML from the current schema with `python docs/diagrams/order-service/build_diagram.py`. The SVG files and viewer are verified exports of this delivery; regenerate those through diagrams.net after changing the diagram. No application runtime tests were run because this delivery changes documentation artifacts only.
