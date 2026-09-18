port module Main exposing (main)

import Browser
import Browser.Dom as Dom
import Date exposing (Day)
import Html exposing (Html)
import Html.Attributes as Attr
import Html.Events as Events
import Json.Decode as Decode
import Json.Encode as Encode
import LucideIcons
import Process
import Task
import Tasks exposing (Store)


port persist : { data : Encode.Value, message : String } -> Cmd msg


port saved : ({ message : String, ok : Bool } -> msg) -> Sub msg


port dayChanged : (Day -> msg) -> Sub msg


port storageChanged : (Encode.Value -> msg) -> Sub msg


type Source
    = New
    | Single Int
    | Template Int


type Mode
    = Schedule
    | Completed


type alias Draft =
    { source : Source, title : String, details : String, date : String, every : String, unit : Maybe Tasks.Unit, completed : Maybe Day }


type Page
    = ListPage
    | Editor Draft


type alias Model =
    { store : Store
    , today : Day
    , page : Page
    , mode : Mode
    , scheduling : Bool
    , deleting : Bool
    , notice : String
    , noticeId : Int
    , fatal : Bool
    }


type alias Flags =
    { today : Day, data : Encode.Value, error : String }


type Msg
    = SetMode Mode
    | Add
    | OpenTask Tasks.Task
    | OpenSeries Tasks.Series
    | Title String
    | Details String
    | Due String
    | Every String
    | Unit String
    | ToggleSchedule
    | Save
    | ToggleCompletion
    | AskDelete Bool
    | Delete
    | Saved { message : String, ok : Bool }
    | DismissNotice Int String
    | DayChanged Day
    | StorageChanged Encode.Value
    | NoOp


main : Program Flags Model Msg
main =
    Browser.element
        { init = init
        , update = update
        , subscriptions = \_ -> Sub.batch [ saved Saved, dayChanged DayChanged, storageChanged StorageChanged ]
        , view = view
        }


readStore : Encode.Value -> Result Decode.Error Store
readStore =
    Decode.decodeValue (Decode.oneOf [ Decode.null Tasks.empty, Tasks.decoder ])


init : Flags -> ( Model, Cmd Msg )
init flags =
    let
        result =
            readStore flags.data

        original =
            Result.withDefault Tasks.empty result

        store =
            Tasks.advance flags.today original

        failed =
            flags.error /= "" || Result.toMaybe result == Nothing

        model =
            { store = store
            , today = flags.today
            , page = ListPage
            , mode = Schedule
            , scheduling = False
            , deleting = False
            , notice =
                if failed then
                    "Your saved tasks could not be read. Reload to try again; your stored data has not been replaced."

                else
                    ""
            , noticeId = 0
            , fatal = failed
            }
    in
    ( model
    , if not failed && store /= original then
        persist { data = Tasks.encode store, message = "" }

      else
        Cmd.none
    )


edit : (Draft -> Draft) -> Model -> ( Model, Cmd Msg )
edit change model =
    case model.page of
        Editor draft ->
            ( { model
                | page = Editor (change draft)
                , notice = ""
                , deleting = False
              }
            , Cmd.none
            )

        ListPage ->
            ( model, Cmd.none )


open : Draft -> Model -> ( Model, Cmd Msg )
open draft model =
    ( { model | page = Editor draft, scheduling = False, deleting = False, notice = "" }
    , Dom.focus "task-title" |> Task.attempt (\_ -> NoOp)
    )


commit : String -> Store -> Model -> ( Model, Cmd Msg )
commit message store model =
    let
        advanced =
            Tasks.advance model.today store
    in
    ( { model | store = advanced, page = ListPage, deleting = False, notice = "" }
    , persist { data = Tasks.encode advanced, message = message }
    )


commitIfChanged : String -> Store -> Model -> ( Model, Cmd Msg )
commitIfChanged message store model =
    if store == model.store then
        ( { model | page = ListPage, deleting = False, notice = "" }, Cmd.none )

    else
        commit message store model


closeEditor : Model -> ( Model, Cmd Msg )
closeEditor model =
    ( { model | page = ListPage, deleting = False, notice = "" }, Cmd.none )


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        SetMode mode ->
            ( { model | mode = mode, notice = "" }, Cmd.none )

        Add ->
            open { source = New, title = "", details = "", date = Date.toIso model.today, every = "1", unit = Nothing, completed = Nothing } { model | mode = Schedule }

        OpenTask task ->
            open { source = Single task.id, title = task.title, details = task.details, date = Date.toIso task.date, every = "1", unit = Nothing, completed = task.completed } model

        OpenSeries series ->
            open { source = Template series.id, title = series.title, details = series.details, date = Date.toIso (nextDate series), every = String.fromInt series.rule.every, unit = Just series.rule.unit, completed = Nothing } model

        Title value ->
            edit (\draft -> { draft | title = value }) model

        Details value ->
            edit (\draft -> { draft | details = value }) model

        Due value ->
            edit (\draft -> { draft | date = value }) model

        Every value ->
            edit (\draft -> { draft | every = value }) model

        Unit value ->
            if value == "" then
                edit (\draft -> { draft | unit = Nothing, every = "1" }) model

            else
                case Tasks.unitFromString value of
                    Just unit ->
                        edit (\draft -> { draft | unit = Just unit }) model

                    Nothing ->
                        ( model, Cmd.none )

        ToggleSchedule ->
            ( { model | scheduling = not model.scheduling }, Cmd.none )

        Save ->
            saveDraftFromPage False model

        ToggleCompletion ->
            saveDraftFromPage True model

        AskDelete value ->
            ( { model | deleting = value }, Cmd.none )

        Delete ->
            case model.page of
                Editor draft ->
                    let
                        store =
                            model.store
                    in
                    case draft.source of
                        Template id ->
                            commit "Planned occurrences deleted" { store | series = List.filter (\series -> series.id /= id) store.series } model

                        _ ->
                            ( { model | page = ListPage, deleting = False }, Cmd.none )

                ListPage ->
                    ( model, Cmd.none )

        Saved result ->
            if result.message == "" then
                ( model, Cmd.none )

            else if result.ok then
                notify result.message model

            else
                ( { model | notice = result.message }, Cmd.none )

        DismissNotice id message ->
            if model.noticeId == id && model.notice == message then
                ( { model | notice = "" }, Cmd.none )

            else
                ( model, Cmd.none )

        DayChanged today ->
            let
                store =
                    Tasks.advance today model.store

                editing =
                    model.page /= ListPage && store /= model.store

                updated =
                    { model
                        | today = today
                        , store = store
                        , page =
                            if editing then
                                ListPage

                            else
                                model.page
                        , deleting =
                            if editing then
                                False

                            else
                                model.deleting
                    }

                persistCommand =
                    if store /= model.store && not model.fatal then
                        persist { data = Tasks.encode store, message = "" }

                    else
                        Cmd.none
            in
            if editing then
                let
                    ( notified, noticeCommand ) =
                        notify "Updated for the new day; unsaved edits were discarded" updated
                in
                ( notified, Cmd.batch [ persistCommand, noticeCommand ] )

            else
                ( updated, persistCommand )

        StorageChanged value ->
            case readStore value of
                Ok store ->
                    let
                        latest =
                            Tasks.advance model.today store

                        updated =
                            { model | store = latest, page = ListPage, deleting = False }
                    in
                    notify "Applied updates from another tab" updated

                Err _ ->
                    ( { model | fatal = True, notice = "Saved tasks changed but could not be read. Reload to try again" }, Cmd.none )

        NoOp ->
            ( model, Cmd.none )


notify : String -> Model -> ( Model, Cmd Msg )
notify message model =
    let
        id =
            model.noticeId + 1
    in
    ( { model | notice = message, noticeId = id }
    , Process.sleep 3000 |> Task.perform (\_ -> DismissNotice id message)
    )


saveDraftFromPage : Bool -> Model -> ( Model, Cmd Msg )
saveDraftFromPage toggleCompletion model =
    case model.page of
        Editor draft ->
            if toggleCompletion && draft.unit /= Nothing then
                ( model, Cmd.none )

            else if String.trim draft.title == "" && String.trim draft.details == "" && not toggleCompletion && draft.source == New then
                ( { model | page = ListPage }, Cmd.none )

            else if String.trim draft.title == "" then
                ( { model | notice = "Give this task a name" }, Dom.focus "task-title" |> Task.attempt (\_ -> NoOp) )

            else
                case ( Date.fromIso draft.date, String.toInt draft.every ) of
                    ( Just date, Just every ) ->
                        if every < 1 || every > 999 then
                            ( { model | notice = "Repeat every 1–999 days, weeks, months, or years" }, Cmd.none )

                        else
                            saveDraft toggleCompletion date every draft model

                    _ ->
                        ( { model | notice = "Choose a valid date and repeat interval" }, Cmd.none )

        ListPage ->
            ( model, Cmd.none )


saveDraft : Bool -> Day -> Int -> Draft -> Model -> ( Model, Cmd Msg )
saveDraft toggleCompletion date every draft model =
    let
        store =
            model.store

        id =
            case draft.source of
                New ->
                    store.nextId

                Single taskId ->
                    taskId

                Template seriesId ->
                    seriesId

        title =
            String.trim draft.title

        completed =
            if toggleCompletion then
                if draft.completed == Nothing then
                    Just model.today

                else
                    Nothing

            else
                draft.completed

        task =
            { id = id, title = title, details = String.trim draft.details, date = date, completed = completed }

        message =
            if toggleCompletion then
                if draft.completed == Nothing then
                    "Task completed"

                else
                    "Task reopened"

            else
                "Saved successfully"

        withoutOriginal =
            { store | tasks = List.filter (\item -> item.id /= id) store.tasks, series = List.filter (\item -> item.id /= id) store.series }
    in
    case draft.unit of
        Nothing ->
            case List.filter (\item -> item.id == id) store.tasks |> List.head of
                Just original ->
                    if original == task then
                        closeEditor model

                    else
                        commitIfChanged message (Tasks.putTask task withoutOriginal) model

                Nothing ->
                    commitIfChanged message (Tasks.putTask task withoutOriginal) model

        Just unit ->
            let
                original =
                    List.filter (\item -> item.id == id) store.series |> List.head

                rule =
                    { every = every, unit = unit }

                series =
                    seriesForDraft id date rule draft original
            in
            case original of
                Just previous ->
                    if previous == series then
                        closeEditor model

                    else
                        commitIfChanged message (Tasks.putSeries series withoutOriginal) model

                Nothing ->
                    commitIfChanged message (Tasks.putSeries series withoutOriginal) model


nextDate : Tasks.Series -> Day
nextDate series =
    Tasks.future 1 series |> List.head |> Maybe.map Tuple.second |> Maybe.withDefault series.start


seriesForDraft : Int -> Day -> Tasks.Rule -> Draft -> Maybe Tasks.Series -> Tasks.Series
seriesForDraft id date rule draft original =
    let
        fresh =
            { id = id, title = String.trim draft.title, details = String.trim draft.details, start = date, rule = rule, next = 0, skipped = [] }
    in
    case original of
        Just previous ->
            if date == nextDate previous && rule == previous.rule then
                { previous | title = fresh.title, details = fresh.details }

            else
                fresh

        Nothing ->
            fresh


icon : (List (Html.Attribute msg) -> Html msg) -> Html msg
icon render =
    render [ Attr.attribute "class" "inline-block shrink-0 align-middle text-[18px] opacity-65", Attr.attribute "aria-hidden" "true", Attr.attribute "focusable" "false" ]


button : String -> Msg -> List (Html Msg) -> Html Msg
button class msg children =
    Html.button [ Attr.type_ "button", Attr.class class, Events.onClick msg ] children


view : Model -> Html Msg
view model =
    Html.main_ [ Attr.class "mx-auto min-h-dvh max-w-[430px] px-6 py-7 min-[600px]:py-12" ]
        [ if model.fatal then
            Html.p [ Attr.class "mx-3 my-10 text-center text-[13px] leading-[1.6] text-[#777771]" ] [ Html.text "Unable to open your tasks" ]

          else
            case model.page of
                ListPage ->
                    listView model

                Editor draft ->
                    editorView model draft
        , Html.div [ Attr.class "fixed bottom-20 left-1/2 z-10 w-[min(382px,calc(100%-48px))] -translate-x-1/2 rounded-lg bg-[#373735] px-4 py-3.5 text-xs leading-[1.5] text-white empty:hidden", Attr.attribute "role" "status", Attr.attribute "aria-live" "polite" ]
            [ Html.text model.notice
            ]
        ]


listView : Model -> Html Msg
listView model =
    let
        ordinary =
            model.store.tasks
                |> List.filter (taskMatches model.mode)
                |> List.map
                    (\task ->
                        ( sortDate model.mode task
                        , task.id
                        , row model.today task.title task.details task.date task.completed False (OpenTask task)
                        )
                    )

        repeating =
            case model.mode of
                Completed ->
                    []

                Schedule ->
                    model.store.series
                        |> List.concatMap (\series -> Tasks.futureUntil (Date.addMonths 12 model.today) series |> List.map (\( _, date ) -> ( date, series.id, row model.today series.title series.details date Nothing True (OpenSeries series) )))

        rows =
            ordinary ++ repeating |> List.sortBy (\( date, id, _ ) -> ( date, id )) |> List.map (\( _, _, html ) -> html)

        radio option title =
            Html.label [ Attr.class "flex min-h-7 cursor-pointer items-center gap-[7px] text-sm" ]
                [ Html.input [ Attr.type_ "radio", Attr.name "status", Attr.checked (model.mode == option), Events.onCheck (\_ -> SetMode option) ] []
                , Html.text title
                ]
    in
    Html.div [ Attr.class "flex min-h-[calc(100dvh-56px)] flex-col min-[600px]:min-h-[calc(100dvh-84px)]" ]
        [ Html.fieldset [ Attr.class "m-0 mb-6 flex justify-center gap-6 border-0 p-3 px-0" ]
            [ Html.legend [ Attr.class "sr-only" ] [ Html.text "Show tasks" ], radio Schedule "Schedule", radio Completed "Completed" ]
        , case model.mode of
            Completed ->
                Html.p [ Attr.class "-mt-2 mb-[18px] text-center text-[13px] leading-[1.6] text-[#777771]" ] [ Html.text "Completed tasks are deleted after a year" ]

            Schedule ->
                Html.text ""
        , if List.isEmpty rows then
            Html.p [ Attr.class "mx-3 my-10 text-center text-[13px] leading-[1.6] text-[#777771]" ]
                [ Html.text
                    (case model.mode of
                        Completed ->
                            "No completed tasks yet"

                        Schedule ->
                            "Nothing to do, add a task when you’re ready"
                    )
                ]

          else
            Html.ul [ Attr.class "m-0 list-none p-0" ] rows
        , case model.mode of
            Schedule ->
                Html.footer [ Attr.class "sticky bottom-0 mt-auto flex justify-center bg-white py-3" ] [ button "inline-flex min-h-11 min-w-20 items-center justify-center gap-1.5 text-sm hover:text-black" Add [ icon LucideIcons.plusIcon, Html.text "Add" ] ]

            Completed ->
                Html.text ""
        ]


taskMatches : Mode -> Tasks.Task -> Bool
taskMatches mode task =
    case ( mode, task.completed ) of
        ( Schedule, Nothing ) ->
            True

        ( Completed, Just _ ) ->
            True

        _ ->
            False


sortDate : Mode -> Tasks.Task -> Day
sortDate mode task =
    case mode of
        Schedule ->
            task.date

        Completed ->
            -(Maybe.withDefault task.date task.completed)


row : Day -> String -> String -> Day -> Maybe Day -> Bool -> Msg -> Html Msg
row today title details date completed repeating action =
    Html.li []
        [ button
            ("w-full min-h-[58px] py-3 text-left hover:text-black "
                ++ (if completed /= Nothing then
                        "line-through text-[#73736d]"

                    else
                        ""
                   )
            )
            action
            [ Html.div [ Attr.class "flex items-baseline justify-between gap-4 text-sm" ]
                [ Html.span [ Attr.class "overflow-hidden text-ellipsis whitespace-nowrap" ] [ Html.text title ]
                , Html.span [ Attr.class "inline-flex shrink-0 items-center gap-1 text-xs text-[#696963]" ]
                    [ if repeating then
                        icon LucideIcons.repeatIcon

                      else
                        Html.text ""
                    , Html.text (Date.label today date)
                    ]
                ]
            , if details /= "" then
                Html.div [ Attr.class "mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-[1.4] text-[#777771]" ] [ Html.text details ]

              else
                Html.text ""
            ]
        ]


editorView : Model -> Draft -> Html Msg
editorView model draft =
    let
        original =
            case draft.source of
                Template id ->
                    List.filter (\series -> series.id == id) model.store.series |> List.head

                _ ->
                    Nothing

        isTemplate =
            draft.unit /= Nothing

        preview =
            case ( Date.fromIso draft.date, String.toInt draft.every ) of
                ( Just date, Just every ) ->
                    case draft.unit of
                        Nothing ->
                            Date.label model.today date

                        Just unit ->
                            Tasks.future 3 (seriesForDraft 0 date { every = max 1 every, unit = unit } draft original)
                                |> List.map (\( _, day ) -> Date.label model.today day)
                                |> String.join ", "
                                |> (\value -> value ++ ", …")

                _ ->
                    "Choose a date"

        option value title =
            Html.option [ Attr.attribute "value" value, Attr.selected (Tasks.unitFromString value == draft.unit) ] [ Html.text title ]
    in
    Html.div [ Attr.class "flex min-h-[calc(100dvh-56px)] flex-col min-[600px]:min-h-[calc(100dvh-84px)]" ]
        [ Html.header [ Attr.class "mb-[22px] flex items-center justify-between" ]
            [ Html.button [ Attr.type_ "button", Attr.class "-ml-3 grid min-h-11 min-w-11 place-items-center hover:text-black", Attr.attribute "aria-label" "Save and go back", Attr.title "Save and go back", Events.onClick Save ] [ icon LucideIcons.arrowLeftIcon ]
            , if isTemplate then
                button "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold hover:text-black" (AskDelete True) [ icon LucideIcons.trash2Icon, Html.text "Delete" ]

              else
                button "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold hover:text-black"
                    ToggleCompletion
                    [ icon
                        (if draft.completed == Nothing then
                            LucideIcons.checkIcon

                         else
                            LucideIcons.undo2Icon
                        )
                    , Html.text
                        (if draft.completed == Nothing then
                            "Complete"

                         else
                            "Reopen"
                        )
                    ]
            ]
        , Html.input [ Attr.id "task-title", Attr.class "w-full rounded-none border-0 bg-transparent px-0 py-1 text-xl font-semibold placeholder:text-[#91918b] focus:outline-2 focus:outline-offset-4 focus:outline-[#53534c]", Attr.type_ "text", Attr.placeholder "New task", Attr.attribute "aria-label" "Task title", Attr.value draft.title, Attr.readonly (draft.completed /= Nothing), Events.onInput Title, Attr.maxlength 500 ] []
        , Html.button
            [ Attr.type_ "button"
            , Attr.class "my-2 mb-4 flex min-h-8 items-center gap-1.5 self-start rounded-[20px] border border-[#d9d9d4] px-2.5 py-1.5 text-left text-[13px] hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
            , Attr.disabled (draft.completed /= Nothing)
            , Attr.attribute "aria-expanded"
                (if model.scheduling then
                    "true"

                 else
                    "false"
                )
            , Attr.attribute "aria-controls" "schedule"
            , Events.onClick ToggleSchedule
            ]
            [ icon
                (if draft.unit == Nothing then
                    LucideIcons.clockIcon

                 else
                    LucideIcons.repeatIcon
                )
            , Html.text preview
            ]
        , if model.scheduling then
            Html.div [ Attr.id "schedule", Attr.class "mb-[18px] rounded-lg border border-[#e3e3de] p-4 text-[13px]" ]
                [ Html.label [ Attr.for "due-date", Attr.class "mb-2 block" ]
                    [ Html.text
                        (if isTemplate then
                            "Next occurrence"

                         else
                            "Date"
                        )
                    ]
                , Html.input [ Attr.id "due-date", Attr.type_ "date", Attr.class "min-h-10 w-full min-w-0 rounded-[5px] border border-[#d9d9d4] bg-white p-2 text-base", Attr.disabled (draft.completed /= Nothing), Attr.value draft.date, Attr.min "0001-01-01", Attr.max "9999-12-31", Events.onInput Due ] []
                , Html.div [ Attr.class "mt-3.5 flex flex-wrap items-center gap-3" ]
                    [ Html.label [ Attr.for "repeat-unit" ] [ Html.text "Repeat" ]
                    , Html.select [ Attr.id "repeat-unit", Attr.class "ml-auto min-h-10 rounded-[5px] border border-[#d9d9d4] bg-white p-2 text-base", Attr.value (Maybe.map Tasks.unitToString draft.unit |> Maybe.withDefault ""), Attr.disabled (draft.completed /= Nothing), Events.onInput Unit ]
                        [ option "" "Never", option "days" "Days", option "weeks" "Weeks", option "months" "Months", option "years" "Years" ]
                    , case draft.unit of
                        Just unit ->
                            Html.label [ Attr.class "flex w-full items-center gap-2" ]
                                [ Html.text "Every", Html.input [ Attr.class "min-h-10 w-[75px] rounded-[5px] border border-[#d9d9d4] bg-white p-2 text-base", Attr.type_ "number", Attr.attribute "aria-label" "Repeat every", Attr.min "1", Attr.max "999", Attr.step "1", Attr.value draft.every, Events.onInput Every ] [], Html.text (Tasks.unitToString unit) ]

                        Nothing ->
                            Html.text ""
                    ]
                ]

          else
            Html.text ""
        , Html.textarea [ Attr.class "block min-h-[240px] w-full flex-1 resize-y border-0 bg-transparent px-0 py-1 text-base leading-[1.6] placeholder:text-[#91918b] focus:outline-2 focus:outline-offset-4 focus:outline-[#53534c]", Attr.placeholder "Details", Attr.attribute "aria-label" "Details", Attr.value draft.details, Attr.readonly (draft.completed /= Nothing), Events.onInput Details ] []
        , if model.deleting && isTemplate then
            Html.div [ Attr.class "flex justify-end pt-[30px] text-xs" ]
                [ Html.div [ Attr.class "max-w-[235px] text-right" ]
                    [ Html.p [ Attr.class "m-0 leading-[1.5]" ] [ Html.text "Delete all planned occurrences?" ]
                    , button "inline-flex min-h-11 items-center gap-1.5 px-0 py-2 text-[#a1372e] hover:text-[#a1372e]" Delete [ icon LucideIcons.trash2Icon, Html.text "Delete" ]
                    , button "ml-[22px] min-h-11 px-0 py-2 text-[#777771] hover:text-black" (AskDelete False) [ Html.text "Keep" ]
                    ]
                ]

          else
            Html.text ""
        ]
