port module Ports exposing
    ( authChanged
    , generateUuid
    , setDoc
    , setDocFailed
    , signIn
    , signInFailed
    , signOut
    , signOutFailed
    , userDataChanged
    , userDataFailed
    , uuidFailed
    , uuidGenerated
    )

import Json.Encode as Encode
import User exposing (User)


port signIn : () -> Cmd msg


port signInFailed : (String -> msg) -> Sub msg


port signOut : () -> Cmd msg


port signOutFailed : (String -> msg) -> Sub msg


port authChanged : (Maybe User -> msg) -> Sub msg


port userDataChanged : (Maybe Encode.Value -> msg) -> Sub msg


port userDataFailed : (String -> msg) -> Sub msg


port generateUuid : () -> Cmd msg


port uuidGenerated : (String -> msg) -> Sub msg


port uuidFailed : (String -> msg) -> Sub msg


port setDoc : Encode.Value -> Cmd msg


port setDocFailed : (String -> msg) -> Sub msg
