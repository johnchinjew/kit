module TasksTest exposing (tests)

import Date
import Expect
import Json.Decode as Decode
import Json.Encode as Encode
import Tasks
import Test exposing (Test, describe, test)


day : String -> Int
day value =
    Date.fromIso value |> Maybe.withDefault -999999


series : Tasks.Series
series =
    { id = 1, title = "Water succulent", details = "A little water", start = day "2026-03-13", rule = { every = 2, unit = Tasks.Days }, next = 0, skipped = [] }


tests : Test
tests =
    describe "tasks"
        [ test "all missed and today's occurrences are cut" <|
            \_ ->
                let
                    today =
                        day "2026-03-17"

                    store =
                        Tasks.putSeries series Tasks.empty |> Tasks.advance today
                in
                Expect.equal
                    (List.map day [ "2026-03-13", "2026-03-15", "2026-03-17" ])
                    (List.map .date store.tasks |> List.sort)
        , test "advancing is idempotent" <|
            \_ ->
                let
                    today =
                        day "2026-03-17"

                    cut =
                        Tasks.putSeries series Tasks.empty |> Tasks.advance today
                in
                Expect.equal cut (Tasks.advance today cut)
        , test "advancing multiple templates is idempotent" <|
            \_ ->
                let
                    today =
                        day "2026-03-17"

                    initial =
                        Tasks.putSeries series Tasks.empty

                    many =
                        Tasks.putSeries { series | id = 8, start = today + 4 } initial |> Tasks.advance today
                in
                Expect.equal many (Tasks.advance today many)
        , test "future occurrences remain on the template" <|
            \_ ->
                let
                    today =
                        day "2026-03-17"

                    cut =
                        Tasks.putSeries series Tasks.empty |> Tasks.advance today
                in
                Expect.equal
                    (Just (List.map day [ "2026-03-19", "2026-03-21" ]))
                    (List.head cut.series |> Maybe.map (Tasks.future 2 >> List.map Tuple.second))
        , test "template edits never change cut tasks" <|
            \_ ->
                let
                    today =
                        day "2026-03-17"

                    cut =
                        Tasks.putSeries series Tasks.empty |> Tasks.advance today
                in
                case List.head cut.series of
                    Just template ->
                        let
                            revised =
                                Tasks.putSeries { template | title = "Changed", details = "New details" } cut
                                    |> Tasks.advance (day "2026-03-19")
                        in
                        Expect.equal cut.tasks (List.filter (\task -> task.date <= today) revised.tasks)

                    Nothing ->
                        Expect.fail "expected an active series after advancing"
        , test "the next cut uses the revised template" <|
            \_ ->
                let
                    today =
                        day "2026-03-17"

                    cut =
                        Tasks.putSeries series Tasks.empty |> Tasks.advance today
                in
                case List.head cut.series of
                    Just template ->
                        let
                            revised =
                                Tasks.putSeries { template | title = "Changed", details = "New details" } cut
                                    |> Tasks.advance (day "2026-03-19")
                        in
                        Expect.equal
                            [ "Changed" ]
                            (List.filter (\task -> task.date == day "2026-03-19") revised.tasks |> List.map .title)

                    Nothing ->
                        Expect.fail "expected an active series after advancing"
        , test "early completed dates are not cut again" <|
            \_ ->
                let
                    today =
                        day "2026-03-17"

                    store =
                        Tasks.putSeries { series | skipped = [ 1 ] } Tasks.empty |> Tasks.advance today
                in
                Expect.equal
                    (List.map day [ "2026-03-13", "2026-03-17" ])
                    (List.map .date store.tasks |> List.sort)
        , test "future preview omits early completions" <|
            \_ ->
                Expect.equal
                    (List.map day [ "2026-03-19", "2026-03-23", "2026-03-25" ])
                    (Tasks.future 3 { series | next = 3, skipped = [ 4 ] } |> List.map Tuple.second)
        , test "future preview stops at its date horizon" <|
            \_ ->
                Expect.equal
                    (List.map day [ "2026-03-13", "2026-03-15", "2026-03-17" ])
                    (Tasks.futureUntil (day "2026-03-18") series |> List.map Tuple.second)
        , test "monthly repeats clamp without drifting" <|
            \_ ->
                let
                    monthly =
                        { series | start = day "2024-01-31", rule = { every = 1, unit = Tasks.Months } }
                in
                Expect.equal
                    [ "2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30" ]
                    (List.range 0 3 |> List.map (Tasks.occurrence monthly >> Date.toIso))
        , test "yearly repeats recover leap day" <|
            \_ ->
                let
                    yearly =
                        { series | start = day "2024-02-29", rule = { every = 1, unit = Tasks.Years } }
                in
                Expect.equal
                    [ "2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29" ]
                    (List.range 0 4 |> List.map (Tasks.occurrence yearly >> Date.toIso))
        , test "weekly cadence crosses DST as calendar days" <|
            \_ ->
                Expect.equal
                    (day "2026-03-15")
                    (Tasks.occurrence { series | start = day "2026-03-01", rule = { every = 1, unit = Tasks.Weeks } } 2)
        , test "completed tasks expire at one year; open tasks do not" <|
            \_ ->
                let
                    today =
                        day "2026-03-17"

                    old =
                        { id = 10, title = "Done", details = "", date = day "2024-01-01", completed = Just (day "2025-03-17") }

                    current =
                        { old | id = 11, completed = Just (day "2025-03-18") }

                    open =
                        { old | id = 12, completed = Nothing }

                    retained =
                        Tasks.empty |> Tasks.putTask old |> Tasks.putTask current |> Tasks.putTask open |> Tasks.advance today
                in
                Expect.equal [ 11, 12 ] (List.map .id retained.tasks |> List.sort)
        , test "leap-day completion expires the next February 28" <|
            \_ ->
                let
                    completed =
                        { id = 10, title = "Done", details = "", date = day "2024-01-01", completed = Just (day "2024-02-29") }
                in
                Expect.equal
                    True
                    (Tasks.putTask completed Tasks.empty |> Tasks.advance (day "2025-02-28") |> .tasks |> List.isEmpty)
        , test "deleted cut occurrences are not regenerated" <|
            \_ ->
                let
                    today =
                        day "2026-03-17"

                    cut =
                        Tasks.putSeries series Tasks.empty |> Tasks.advance today
                in
                Expect.equal [] (Tasks.advance today { cut | tasks = [] } |> .tasks)
        , test "a stopped template leaves independent tasks" <|
            \_ ->
                let
                    today =
                        day "2026-03-17"

                    cut =
                        Tasks.putSeries series Tasks.empty |> Tasks.advance today
                in
                Expect.equal cut.tasks (Tasks.advance (today + 30) { cut | series = [] } |> .tasks)
        , describe "serialization"
            [ test "local storage encoding round trips" <|
                \_ ->
                    let
                        today =
                            day "2026-03-17"

                        initial =
                            Tasks.putSeries series Tasks.empty

                        many =
                            Tasks.putSeries { series | id = 8, start = today + 4 } initial |> Tasks.advance today
                    in
                    Expect.equal
                        (Ok many)
                        (Decode.decodeValue Tasks.decoder (Tasks.encode many))
            , test "saved repeat units decode from fixed JSON" <|
                \_ ->
                    let
                        days =
                            { id = 1, title = "", details = "", start = 0, rule = { every = 1, unit = Tasks.Days }, next = 0, skipped = [] }

                        weeks =
                            { days | rule = { every = 1, unit = Tasks.Weeks } }

                        months =
                            { days | rule = { every = 1, unit = Tasks.Months } }

                        years =
                            { days | rule = { every = 1, unit = Tasks.Years } }

                        expected value =
                            Ok { tasks = [], series = [ value ], nextId = 2 }
                    in
                    Expect.equal
                        [ expected days, expected weeks, expected months, expected years ]
                        [ Decode.decodeString Tasks.decoder "{\"version\":1,\"nextId\":2,\"tasks\":[],\"series\":[{\"id\":1,\"title\":\"\",\"details\":\"\",\"start\":0,\"every\":1,\"unit\":\"days\",\"next\":0,\"skipped\":[]}] }"
                        , Decode.decodeString Tasks.decoder "{\"version\":1,\"nextId\":2,\"tasks\":[],\"series\":[{\"id\":1,\"title\":\"\",\"details\":\"\",\"start\":0,\"every\":1,\"unit\":\"weeks\",\"next\":0,\"skipped\":[]}] }"
                        , Decode.decodeString Tasks.decoder "{\"version\":1,\"nextId\":2,\"tasks\":[],\"series\":[{\"id\":1,\"title\":\"\",\"details\":\"\",\"start\":0,\"every\":1,\"unit\":\"months\",\"next\":0,\"skipped\":[]}] }"
                        , Decode.decodeString Tasks.decoder "{\"version\":1,\"nextId\":2,\"tasks\":[],\"series\":[{\"id\":1,\"title\":\"\",\"details\":\"\",\"start\":0,\"every\":1,\"unit\":\"years\",\"next\":0,\"skipped\":[]}] }"
                        ]
            , test "repeat units encode to fixed JSON" <|
                \_ ->
                    let
                        store unit =
                            Tasks.putSeries
                                { id = 1, title = "", details = "", start = 0, rule = { every = 1, unit = unit }, next = 0, skipped = [] }
                                Tasks.empty
                    in
                    Expect.equal
                        [ "{\"version\":1,\"nextId\":2,\"tasks\":[],\"series\":[{\"id\":1,\"title\":\"\",\"details\":\"\",\"start\":0,\"every\":1,\"unit\":\"days\",\"next\":0,\"skipped\":[]}]}"
                        , "{\"version\":1,\"nextId\":2,\"tasks\":[],\"series\":[{\"id\":1,\"title\":\"\",\"details\":\"\",\"start\":0,\"every\":1,\"unit\":\"weeks\",\"next\":0,\"skipped\":[]}]}"
                        , "{\"version\":1,\"nextId\":2,\"tasks\":[],\"series\":[{\"id\":1,\"title\":\"\",\"details\":\"\",\"start\":0,\"every\":1,\"unit\":\"months\",\"next\":0,\"skipped\":[]}]}"
                        , "{\"version\":1,\"nextId\":2,\"tasks\":[],\"series\":[{\"id\":1,\"title\":\"\",\"details\":\"\",\"start\":0,\"every\":1,\"unit\":\"years\",\"next\":0,\"skipped\":[]}]}"
                        ]
                        ([ Tasks.Days, Tasks.Weeks, Tasks.Months, Tasks.Years ]
                            |> List.map (store >> Tasks.encode >> Encode.encode 0)
                        )
            , test "invalid repeat intervals are rejected" <|
                \_ ->
                    let
                        initial =
                            Tasks.putSeries series Tasks.empty

                        invalid =
                            { initial | series = [ { series | rule = { every = 0, unit = Tasks.Days } } ] }
                    in
                    Expect.equal
                        Nothing
                        (Decode.decodeValue Tasks.decoder (Tasks.encode invalid) |> Result.toMaybe)
            , test "unknown repeat units are rejected at the JSON boundary" <|
                \_ ->
                    Expect.equal
                        Nothing
                        (Decode.decodeString Tasks.decoder "{\"version\":1,\"nextId\":1,\"tasks\":[],\"series\":[{\"id\":1,\"title\":\"\",\"details\":\"\",\"start\":0,\"every\":1,\"unit\":\"fortnights\",\"next\":0,\"skipped\":[]}] }"
                            |> Result.toMaybe
                        )
            ]
        ]
