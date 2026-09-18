module DateTest exposing (tests)

import Date
import Expect
import Test exposing (Test, describe, test)


day : String -> Int
day value =
    Date.fromIso value |> Maybe.withDefault -999999


tests : Test
tests =
    describe "dates"
        [ test "epoch and pre-epoch dates" <|
            \_ ->
                Expect.equal
                    ( 0, -1 )
                    ( day "1970-01-01", day "1969-12-31" )
        , test "date parsing rejects invalid calendar dates" <|
            \_ ->
                Expect.equal
                    ( Nothing, Nothing, Nothing )
                    ( Date.fromIso "2026-02-29", Date.fromIso "2026-04-31", Date.fromIso "" )
        , test "calendar dates round trip" <|
            \_ ->
                Expect.equal
                    [ "0001-01-01", "1900-03-01", "2000-02-29", "2024-02-29", "2026-12-31", "9999-12-31" ]
                    (List.map (day >> Date.toIso) [ "0001-01-01", "1900-03-01", "2000-02-29", "2024-02-29", "2026-12-31", "9999-12-31" ])
        ]
