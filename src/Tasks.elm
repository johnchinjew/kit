module Tasks exposing
    ( Rule
    , Series
    , Store
    , Task
    , Unit(..)
    , advance
    , decoder
    , empty
    , encode
    , future
    , futureUntil
    , occurrence
    , putSeries
    , putTask
    , unitFromString
    , unitToString
    )

import Date exposing (Day)
import Json.Decode as Decode exposing (Decoder)
import Json.Encode as Encode


type alias Task =
    { id : Int, title : String, details : String, date : Day, completed : Maybe Day }


type Unit
    = Days
    | Weeks
    | Months
    | Years


type alias Rule =
    { every : Int, unit : Unit }


type alias Series =
    { id : Int, title : String, details : String, start : Day, rule : Rule, next : Int, skipped : List Int }


type alias Store =
    { tasks : List Task, series : List Series, nextId : Int }


empty : Store
empty =
    { tasks = [], series = [], nextId = 1 }


putTask : Task -> Store -> Store
putTask task store =
    { store | tasks = task :: List.filter (\item -> item.id /= task.id) store.tasks, nextId = max store.nextId (task.id + 1) }


putSeries : Series -> Store -> Store
putSeries series store =
    { store | series = series :: List.filter (\item -> item.id /= series.id) store.series, nextId = max store.nextId (series.id + 1) }


occurrence : Series -> Int -> Day
occurrence series index =
    let
        count =
            series.rule.every * index
    in
    case series.rule.unit of
        Weeks ->
            series.start + count * 7

        Months ->
            Date.addMonths count series.start

        Years ->
            Date.addMonths (count * 12) series.start

        Days ->
            series.start + count


{-| Cut each due occurrence into an ordinary task. Advancing the cursor makes
this idempotent, even after completed tasks have expired. Future occurrences
completed early are skipped, so they cannot come back on their original date.
-}
advance : Day -> Store -> Store
advance today store =
    let
        cut series current =
            if occurrence series series.next <= today then
                let
                    date =
                        occurrence series series.next

                    nextStore =
                        if List.member series.next series.skipped then
                            current

                        else
                            { current
                                | tasks = { id = current.nextId, title = series.title, details = series.details, date = date, completed = Nothing } :: current.tasks
                                , nextId = current.nextId + 1
                            }
                in
                cut { series | next = series.next + 1, skipped = List.filter ((/=) series.next) series.skipped } nextStore

            else
                putSeries series current

        retained =
            { store | tasks = List.filter (\task -> Maybe.map (\day -> Date.addMonths 12 day > today) task.completed |> Maybe.withDefault True) store.tasks }
    in
    List.foldr cut retained store.series


future : Int -> Series -> List ( Int, Day )
future count series =
    List.range series.next (series.next + count + List.length series.skipped - 1)
        |> List.filter (\index -> not (List.member index series.skipped))
        |> List.take count
        |> List.map (\index -> ( index, occurrence series index ))


futureUntil : Day -> Series -> List ( Int, Day )
futureUntil limit series =
    let
        collect index occurrences =
            let
                date =
                    occurrence series index
            in
            if date > limit then
                List.reverse occurrences

            else if List.member index series.skipped then
                collect (index + 1) occurrences

            else
                collect (index + 1) (( index, date ) :: occurrences)
    in
    collect series.next []


encode : Store -> Encode.Value
encode store =
    Encode.object
        [ ( "version", Encode.int 1 )
        , ( "nextId", Encode.int store.nextId )
        , ( "tasks", Encode.list encodeTask store.tasks )
        , ( "series", Encode.list encodeSeries store.series )
        ]


encodeTask : Task -> Encode.Value
encodeTask task =
    Encode.object
        [ ( "id", Encode.int task.id )
        , ( "title", Encode.string task.title )
        , ( "details", Encode.string task.details )
        , ( "date", Encode.int task.date )
        , ( "completed", Maybe.map Encode.int task.completed |> Maybe.withDefault Encode.null )
        ]


encodeSeries : Series -> Encode.Value
encodeSeries series =
    Encode.object
        [ ( "id", Encode.int series.id )
        , ( "title", Encode.string series.title )
        , ( "details", Encode.string series.details )
        , ( "start", Encode.int series.start )
        , ( "every", Encode.int series.rule.every )
        , ( "unit", Encode.string (unitToString series.rule.unit) )
        , ( "next", Encode.int series.next )
        , ( "skipped", Encode.list Encode.int series.skipped )
        ]


positive : Decoder Int
positive =
    Decode.int
        |> Decode.andThen
            (\value ->
                if value > 0 then
                    Decode.succeed value

                else
                    Decode.fail "Expected a positive number"
            )


taskDecoder : Decoder Task
taskDecoder =
    Decode.map5 Task
        (Decode.field "id" positive)
        (Decode.field "title" Decode.string)
        (Decode.field "details" Decode.string)
        (Decode.field "date" Decode.int)
        (Decode.field "completed" (Decode.nullable Decode.int))


seriesDecoder : Decoder Series
seriesDecoder =
    Decode.map7 Series
        (Decode.field "id" positive)
        (Decode.field "title" Decode.string)
        (Decode.field "details" Decode.string)
        (Decode.field "start" Decode.int)
        (Decode.map2 Rule
            (Decode.field "every" positive)
            (Decode.field "unit" Decode.string
                |> Decode.andThen
                    (\unit ->
                        case unitFromString unit of
                            Just value ->
                                Decode.succeed value

                            Nothing ->
                                Decode.fail "Unknown repeat unit"
                    )
            )
        )
        (Decode.field "next" Decode.int)
        (Decode.field "skipped" (Decode.list Decode.int))


decoder : Decoder Store
decoder =
    Decode.field "version" Decode.int
        |> Decode.andThen
            (\version ->
                if version == 1 then
                    Decode.map3 Store
                        (Decode.field "tasks" (Decode.list taskDecoder))
                        (Decode.field "series" (Decode.list seriesDecoder))
                        (Decode.field "nextId" positive)

                else
                    Decode.fail "Unsupported saved data version"
            )


unitFromString : String -> Maybe Unit
unitFromString value =
    case value of
        "days" ->
            Just Days

        "weeks" ->
            Just Weeks

        "months" ->
            Just Months

        "years" ->
            Just Years

        _ ->
            Nothing


unitToString : Unit -> String
unitToString unit =
    case unit of
        Days ->
            "days"

        Weeks ->
            "weeks"

        Months ->
            "months"

        Years ->
            "years"
