-- Stock numbers are meaningless without the container size they refer to
-- (750ml vs 1L vs a 6-pack). Each size is already its own product row (no
-- duplicate product names across different sizes anywhere in the starter
-- catalogue), so one nullable text column is enough — no variants/join-table
-- restructuring needed. Free text, not an enum: the catalogue mixes volumes
-- ("750ml") with pack descriptors ("6 pack"), and products without a
-- meaningful size (e.g. food) just leave it null.
alter table products add column size text;
