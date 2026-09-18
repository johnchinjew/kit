module Date exposing (Day, addMonths, fromIso, label, toIso)

import Time


{-| A calendar day, counted from 1970-01-01. No timezone or DST arithmetic.
-}
type alias Day =
    Int


parts : Day -> ( Int, Int, Int )
parts day =
    let
        time =
            Time.millisToPosix (day * 86400000)
    in
    ( Time.toYear Time.utc time, monthNumber (Time.toMonth Time.utc time), Time.toDay Time.utc time )


monthNumber : Time.Month -> Int
monthNumber month =
    case month of
        Time.Jan ->
            1

        Time.Feb ->
            2

        Time.Mar ->
            3

        Time.Apr ->
            4

        Time.May ->
            5

        Time.Jun ->
            6

        Time.Jul ->
            7

        Time.Aug ->
            8

        Time.Sep ->
            9

        Time.Oct ->
            10

        Time.Nov ->
            11

        Time.Dec ->
            12


daysInMonth : Int -> Int -> Int
daysInMonth year month =
    if month == 2 then
        if modBy 4 year == 0 && (modBy 100 year /= 0 || modBy 400 year == 0) then
            29

        else
            28

    else if List.member month [ 4, 6, 9, 11 ] then
        30

    else
        31


fromParts : Int -> Int -> Int -> Day
fromParts year month day =
    let
        previous =
            year - 1

        beforeYear =
            365 * previous + previous // 4 - previous // 100 + previous // 400

        beforeMonth =
            List.range 1 (month - 1) |> List.map (daysInMonth year) |> List.sum
    in
    beforeYear + beforeMonth + day - 719163


fromIso : String -> Maybe Day
fromIso value =
    case List.map String.toInt (String.split "-" value) of
        [ Just year, Just month, Just day ] ->
            if year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth year month then
                Just (fromParts year month day)

            else
                Nothing

        _ ->
            Nothing


toIso : Day -> String
toIso date =
    let
        ( year, month, day ) =
            parts date

        pad width value =
            String.padLeft width '0' (String.fromInt value)
    in
    pad 4 year ++ "-" ++ pad 2 month ++ "-" ++ pad 2 day


addMonths : Int -> Day -> Day
addMonths count date =
    let
        ( year, month, day ) =
            parts date

        total =
            year * 12 + month - 1 + count

        nextYear =
            total // 12

        nextMonth =
            modBy 12 total + 1
    in
    fromParts nextYear nextMonth (min day (daysInMonth nextYear nextMonth))


label : Day -> Day -> String
label today date =
    let
        ( year, month, day ) =
            parts date

        ( currentYear, _, _ ) =
            parts today

        name =
            List.drop (month - 1) [ "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ] |> List.head |> Maybe.withDefault ""
    in
    if date == today then
        "Today"

    else if date == today - 1 then
        "Yesterday"

    else if date == today + 1 then
        "Tomorrow"

    else
        name
            ++ " "
            ++ String.fromInt day
            ++ (if year == currentYear then
                    ""

                else
                    ", " ++ String.fromInt year
               )
