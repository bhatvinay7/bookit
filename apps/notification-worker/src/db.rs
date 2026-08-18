use diesel::prelude::*;
use bookit_db::schema::users::dsl as us;

pub fn get_user_email(conn: &mut PgConnection, u_id: i32) -> String {
    us::users
        .find(u_id)
        .select(us::email)
        .first::<String>(conn)
        .unwrap_or_else(|_| "bookit985@gmail.com".to_string())
}
