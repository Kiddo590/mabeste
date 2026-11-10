-- update_tab_status() is security definer with no role check at all today —
-- any staff could void any tab, bypassing tabs_update's ownership RLS
-- entirely (security-definer functions don't go through the calling
-- table's RLS). Voiding is admin-only per product decision; everything
-- else about the function (version-checked update, exception on mismatch)
-- is unchanged.

create or replace function update_tab_status(
  p_tab_id uuid,
  p_expected_version integer,
  p_new_status text,
  p_closed_by uuid default null
) returns tabs as $$
declare
  v_tab tabs;
begin
  if p_new_status = 'voided' and current_staff_role() <> 'admin' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  update tabs
    set status = p_new_status,
        closed_by = coalesce(p_closed_by, closed_by)
    where id = p_tab_id and version = p_expected_version
    returning * into v_tab;

  if v_tab.id is null then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  return v_tab;
end;
$$ language plpgsql security definer;
