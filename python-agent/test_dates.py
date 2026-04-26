import datetime

state = {
    "studentUid": "A01304605",
    "programStartDate": "2026-05-25",
    "reserveDate": "2026-04-06"
}

now = datetime.datetime.now(datetime.timezone.utc)

reserve_str = state.get("reserveDate")
if reserve_str:
    try:
        reserve_date = datetime.datetime.fromisoformat(reserve_str.replace("Z", "+00:00")).replace(tzinfo=datetime.timezone.utc)
        time_since = max(0, (now.date() - reserve_date.date()).days)
    except Exception as e:
        print("Reserve Exception:", e)
        time_since = 0

start_str = state.get("programStartDate")
if start_str:
    try:
        start_date = datetime.datetime.fromisoformat(start_str.replace("Z", "+00:00")).replace(tzinfo=datetime.timezone.utc)
        print("Start date:", start_date)
        print("Now:", now)
        print("Start date type:", type(start_date))
        print("Now date type:", type(now))
        # This subtraction is the problem in Python?
        diff = start_date.date() - now.date()
        time_start = max(0, diff.days)
        print("Time start:", time_start)
    except Exception as e:
        print("Start exception:", e)
        time_start = 0

