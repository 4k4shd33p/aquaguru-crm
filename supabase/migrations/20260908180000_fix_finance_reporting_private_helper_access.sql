-- Restore authenticated execution of SECURITY INVOKER Finance reporting RPCs.
-- They call private.service_financial_rows(), which requires schema USAGE and
-- explicit function EXECUTE for the authenticated caller.

grant usage on schema private to authenticated;

revoke all on function private.service_financial_rows() from public;
revoke all on function private.service_financial_rows() from anon;
grant execute on function private.service_financial_rows() to authenticated;
