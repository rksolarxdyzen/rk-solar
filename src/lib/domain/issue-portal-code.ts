import { allocateNextPortalCode } from "@/lib/domain/portal";

/** Allocate RKSO{ddMMyy}{NNN} using today's IST date and the next daily sequence. */
export async function issuePortalCode(supabase: {
  from: (table: string) => {
    select: (cols: string) => {
      like: (
        col: string,
        pattern: string
      ) => PromiseLike<{
        data: Array<{ portal_code: string | null }> | null;
        error: { message: string } | null;
      }>;
    };
  };
}): Promise<string> {
  return allocateNextPortalCode(async (prefix) => {
    const { data, error } = await supabase
      .from("leads")
      .select("portal_code")
      .like("portal_code", `${prefix}%`);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((row) => row.portal_code)
      .filter((code): code is string => Boolean(code));
  });
}
