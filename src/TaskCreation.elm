module TaskCreation exposing (State, empty, handleSessionMsg, isPending, setTitle, submit, title)

import Session


type State
    = State { title : String, pending : Bool }


empty : State
empty =
    State { title = "", pending = False }


title : State -> String
title (State state) =
    state.title


isPending : State -> Bool
isPending (State state) =
    state.pending


setTitle : String -> State -> State
setTitle newTitle (State state) =
    State { state | title = newTitle }


submit : State -> Maybe ( String, State )
submit (State state) =
    let
        trimmedTitle =
            String.trim state.title
    in
    if state.pending || String.isEmpty trimmedTitle then
        Nothing

    else
        Just ( trimmedTitle, State { title = "", pending = True } )


handleSessionMsg : Session.Msg -> State -> State
handleSessionMsg sessionMsg state =
    case sessionMsg of
        Session.CreateTaskOutcome _ ->
            case state of
                State current ->
                    State { current | pending = False }

        Session.AuthChanged _ ->
            empty

        _ ->
            state
