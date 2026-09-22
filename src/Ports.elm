port module Ports exposing
    ( authChanged
    , createTask
    , createTaskOutcome
    , signIn
    , signInFailed
    , signOut
    , signOutFailed
    , userDataChanged
    , userDataFailed
    )

import User exposing (User)
import UserData exposing (UserData)


port signIn : () -> Cmd msg


port signInFailed : (String -> msg) -> Sub msg


port signOut : () -> Cmd msg


port signOutFailed : (String -> msg) -> Sub msg


port authChanged : (Maybe User -> msg) -> Sub msg


port userDataChanged : (UserData -> msg) -> Sub msg


port userDataFailed : (String -> msg) -> Sub msg


port createTask : String -> Cmd msg


port createTaskOutcome : (Maybe String -> msg) -> Sub msg
